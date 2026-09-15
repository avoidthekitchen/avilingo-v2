import { Capacitor } from '@capacitor/core'

export type AudioState = 'idle' | 'loading' | 'playing' | 'error'

// WebKit adds a non-standard 'interrupted' state to AudioContext — a phone call, Siri, an
// alarm, or the app deactivating its AVAudioSession on resign-active. It is absent from the
// AudioContextState union, so a `state === 'suspended'` check silently skips it and
// source.start() feeds a dead context: the player reports 'playing', nothing is audible, and
// because one context is shared by every tab nothing recovers until the app restarts.
// Testing for "not already usable" covers both states without naming the non-standard one.
function needsResume(state: AudioContextState): boolean {
  return state !== 'running' && state !== 'closed'
}

export interface AudioPlayer {
  play(url: string, offset?: number): Promise<void>
  stop(): void
  seek(time: number): void
  isPlaying(): boolean
  getState(): AudioState
  getActiveUrl(): string | null
  getProgress(): { currentTime: number; duration: number }
  onStateChange(callback: (state: AudioState) => void): () => void
  onProgress(cb: (currentTime: number, duration: number) => void): () => void
  prefetch(url: string): Promise<AudioBuffer | null>
  getBuffer(url: string): AudioBuffer | null
}

export function playAudioToCompletion(audioPlayer: AudioPlayer, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let started = false
    let settled = false
    const unsubscribe = audioPlayer.onStateChange((state) => {
      if ((state === 'loading' || state === 'playing') && audioPlayer.getActiveUrl() === url) {
        started = true
        return
      }
      if (!started || settled) return

      const endedNaturally = state === 'idle' && audioPlayer.getActiveUrl() === url
      settled = true
      unsubscribe()
      if (endedNaturally) resolve()
      else reject(new Error('Audio playback was interrupted'))
    })

    audioPlayer.play(url).then(() => {
      if (!settled && (audioPlayer.getState() !== 'playing' || audioPlayer.getActiveUrl() !== url)) {
        settled = true
        unsubscribe()
        reject(new Error('Audio playback did not start'))
      }
    }).catch(error => {
      if (settled) return
      settled = true
      unsubscribe()
      reject(error)
    })
  })
}

export class WebAudioPlayer implements AudioPlayer {
  private static readonly NATIVE_START_TIMEOUT_MS = 5000
  private static readonly WEB_START_TIMEOUT_MS = 30_000

  private context: AudioContext | null = null
  private gainNode: GainNode | null = null
  private source: AudioBufferSourceNode | null = null
  private cache = new Map<string, AudioBuffer>()
  private state: AudioState = 'idle'
  private activeUrl: string | null = null
  private activeBuffer: AudioBuffer | null = null
  private playbackStartTime = 0
  private playbackOffset = 0
  private listeners: Array<(state: AudioState) => void> = []
  private progressListeners: Array<(currentTime: number, duration: number) => void> = []
  private rafId: number | null = null
  private playRequestId = 0
  private pendingLoads = new Map<string, {
    promise: Promise<AudioBuffer | null>
    abort: () => void
    token: object
  }>()
  private outputElement: HTMLAudioElement | null = null
  private streamDest: MediaStreamAudioDestinationNode | null = null

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext()
      // An interruption mid-clip never fires source.onended, so the player would sit on
      // 'playing' against a dead context with the control stuck on stop. Drop back to idle
      // so the next tap starts a fresh request and resumes inside a live gesture.
      this.context.addEventListener('statechange', () => {
        if (this.state === 'playing' && needsResume(this.context?.state ?? 'closed')) {
          this.stop()
        }
      })
      this.gainNode = this.context.createGain()
      this.streamDest = this.context.createMediaStreamDestination()
      this.gainNode.connect(this.streamDest)
      // Route through HTMLAudioElement so iOS uses the media channel (ignores silent switch).
      // Element must be in the DOM on some iOS versions for play() to activate the channel.
      this.outputElement = document.createElement('audio')
      this.outputElement.setAttribute('playsinline', '') // defensive for iOS WKWebView / PWA contexts
      this.outputElement.style.display = 'none'
      this.outputElement.srcObject = this.streamDest.stream
      document.body.appendChild(this.outputElement)
    }
    return this.context
  }

  private setState(state: AudioState) {
    this.state = state
    this.listeners.forEach(cb => cb(state))
    if (state === 'playing') {
      this.startProgressLoop()
    } else {
      this.stopProgressLoop()
    }
  }

  private startProgressLoop() {
    if (this.rafId !== null) return
    const tick = () => {
      if (this.progressListeners.length > 0) {
        const { currentTime, duration } = this.getProgress()
        this.progressListeners.forEach(cb => cb(currentTime, duration))
      }
      if (this.state === 'playing') {
        this.rafId = requestAnimationFrame(tick)
      }
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private stopProgressLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  onStateChange(callback: (state: AudioState) => void): () => void {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback)
    }
  }

  getState(): AudioState {
    return this.state
  }

  isPlaying(): boolean {
    return this.state === 'playing'
  }

  getActiveUrl(): string | null {
    return this.activeUrl
  }

  private stopSource() {
    if (!this.source) return

    // Fade out over ~100ms to avoid click/pop artifacts
    if (this.gainNode && this.context) {
      const now = this.context.currentTime
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now)
      this.gainNode.gain.linearRampToValueAtTime(0, now + 0.1)
    }
    this.source.onended = null // Prevent double-fire from source.stop()
    try { this.source.stop() } catch { /* already stopped */ }
    this.disconnectSource(this.source)
    this.source = null
    this.pauseOutput()
  }

  // Activate the HTMLAudioElement output so iOS routes through the media channel.
  // play() must run synchronously within the user gesture — repeat calls on an already
  // playing element are no-ops, so it's safe to call on every play().
  private activateOutput(): Promise<void> {
    return this.outputElement?.play() ?? Promise.reject(new Error('Audio output is unavailable'))
  }

  // One deadline for the whole loading phase. HTMLAudioElement.play(), AudioContext.resume(),
  // and the buffer fetch can each fail to settle on iOS rather than reject, and any of them
  // would otherwise pin the learner in 'loading' with the replay control disabled.
  private createStartDeadline(): { expired: Promise<never>; clear: () => void } {
    let timeoutId: ReturnType<typeof setTimeout>
    const timeoutMs = Capacitor.isNativePlatform()
      ? WebAudioPlayer.NATIVE_START_TIMEOUT_MS
      : WebAudioPlayer.WEB_START_TIMEOUT_MS
    const expired = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Audio playback did not start')),
        timeoutMs,
      )
    })
    // Keeps the deadline handled if play() throws before the first race attaches one.
    expired.catch(() => {})
    return { expired, clear: () => clearTimeout(timeoutId) }
  }

  private isCurrentRequest(requestId: number, url: string) {
    return this.playRequestId === requestId && this.activeUrl === url
  }

  private pauseOutput() {
    if (!this.outputElement) return
    this.outputElement.pause()
  }

  private disconnectSource(source: AudioBufferSourceNode) {
    try { source.disconnect() } catch { /* already disconnected */ }
  }

  private finishPlayback(source: AudioBufferSourceNode) {
    if (this.source !== source) return

    source.onended = null
    this.disconnectSource(source)
    this.source = null
    this.pauseOutput()
    // Fire idle BEFORE nulling so listeners can see which clip ended naturally
    this.setState('idle')
    this.activeUrl = null
    this.activeBuffer = null
  }

  stop() {
    this.playRequestId += 1
    this.stopSource()
    // Null activeUrl BEFORE idle so explicit stop doesn't advance clips
    this.activeUrl = null
    this.activeBuffer = null
    this.setState('idle')
  }

  private loadBuffer(url: string): Promise<AudioBuffer | null> {
    const cached = this.cache.get(url)
    if (cached) return Promise.resolve(cached)

    const existingLoad = this.pendingLoads.get(url)
    if (existingLoad) return existingLoad.promise

    const controller = new AbortController()
    const token = {}
    const loadPromise = (async () => {
      try {
        const ctx = this.getContext()
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`)
        const arrayBuffer = await response.arrayBuffer()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        this.cache.set(url, audioBuffer)
        return audioBuffer
      } catch {
        return null
      } finally {
        if (this.pendingLoads.get(url)?.token === token) {
          this.pendingLoads.delete(url)
        }
      }
    })()

    this.pendingLoads.set(url, {
      promise: loadPromise,
      abort: () => controller.abort(),
      token,
    })
    return loadPromise
  }

  private cancelPendingLoad(url: string, promise: Promise<AudioBuffer | null>) {
    const pendingLoad = this.pendingLoads.get(url)
    if (pendingLoad?.promise !== promise) return

    this.pendingLoads.delete(url)
    pendingLoad.abort()
  }

  prefetch(url: string): Promise<AudioBuffer | null> {
    return this.loadBuffer(url)
  }

  getProgress(): { currentTime: number; duration: number } {
    if (this.state !== 'playing' || !this.activeBuffer || !this.context) {
      return { currentTime: 0, duration: 0 }
    }
    const elapsed = this.context.currentTime - this.playbackStartTime
    return {
      currentTime: this.playbackOffset + elapsed,
      duration: this.activeBuffer.duration,
    }
  }

  seek(time: number): void {
    if (this.state !== 'playing' || !this.activeUrl) return
    const buffer = this.cache.get(this.activeUrl)
    if (!buffer || !this.context || !this.gainNode) return

    // Silently swap the source node — no state transitions, no button flicker
    if (this.source) {
      this.source.onended = null
      try { this.source.stop() } catch { /* already stopped */ }
      this.disconnectSource(this.source)
    }

    this.gainNode.gain.cancelScheduledValues(this.context.currentTime)
    this.gainNode.gain.setValueAtTime(1, this.context.currentTime)

    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.gainNode)
    source.onended = () => {
      this.finishPlayback(source)
    }
    this.source = source
    source.start(0, time)
    this.playbackStartTime = this.context.currentTime
    this.playbackOffset = time
  }

  onProgress(cb: (currentTime: number, duration: number) => void): () => void {
    this.progressListeners.push(cb)
    return () => {
      this.progressListeners = this.progressListeners.filter(l => l !== cb)
    }
  }

  getBuffer(url: string): AudioBuffer | null {
    return this.cache.get(url) ?? null
  }

  async play(url: string, offset?: number): Promise<void> {
    const requestId = this.playRequestId + 1
    this.stop()
    this.playRequestId = requestId
    this.activeUrl = url
    this.setState('loading')
    const deadline = this.createStartDeadline()
    let bufferPromise: Promise<AudioBuffer | null> | undefined

    try {
      const ctx = this.getContext()

      // Both must be issued synchronously within the user gesture, before any await: the
      // HTMLAudioElement activates the media channel, and iOS only honours resume() when
      // it is called in the same task as the gesture that triggered playback.
      const outputActivation = this.activateOutput()
      const contextResume = needsResume(ctx.state) ? ctx.resume() : Promise.resolve()
      bufferPromise = this.loadBuffer(url)

      const started = Promise.all([outputActivation, contextResume])
      // Keeps a late rejection handled when the deadline wins the race below.
      started.catch(() => {})

      try {
        await Promise.race([started, deadline.expired])
      } catch (cause) {
        throw new Error('Audio playback was blocked', { cause })
      }
      if (!this.isCurrentRequest(requestId, url)) return

      const buffer = await Promise.race([bufferPromise, deadline.expired])
      if (!this.isCurrentRequest(requestId, url)) return
      if (!buffer || !this.gainNode) throw new Error('Failed to load audio')

      // Reset gain to full volume before starting new clip.
      // cancelScheduledValues clears any pending fade-out ramp from a prior stop().
      this.gainNode.gain.cancelScheduledValues(ctx.currentTime)
      this.gainNode.gain.setValueAtTime(1, ctx.currentTime)

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(this.gainNode)
      source.onended = () => {
        this.finishPlayback(source)
      }
      this.source = source
      source.start(0, offset ?? 0)
      this.playbackStartTime = ctx.currentTime
      this.playbackOffset = offset ?? 0
      this.activeBuffer = buffer
      this.setState('playing')
    } catch (error) {
      if (!this.isCurrentRequest(requestId, url)) return
      if (bufferPromise) this.cancelPendingLoad(url, bufferPromise)
      this.stopSource()
      this.pauseOutput()
      this.activeBuffer = null
      this.setState('error')
      throw error
    } finally {
      deadline.clear()
    }
  }
}
