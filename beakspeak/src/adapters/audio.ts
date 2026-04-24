export type AudioState = 'idle' | 'loading' | 'playing' | 'error'

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

export class WebAudioPlayer implements AudioPlayer {
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
  private pendingLoads = new Map<string, Promise<AudioBuffer | null>>()
  private outputElement: HTMLAudioElement | null = null
  private streamDest: MediaStreamAudioDestinationNode | null = null

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext()
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
  private activateOutput() {
    this.outputElement?.play().catch(() => {})
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

  private async loadBuffer(url: string): Promise<AudioBuffer | null> {
    const cached = this.cache.get(url)
    if (cached) return cached

    const existingLoad = this.pendingLoads.get(url)
    if (existingLoad) return existingLoad

    const loadPromise = (async () => {
      try {
        const ctx = this.getContext()
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`)
        const arrayBuffer = await response.arrayBuffer()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        this.cache.set(url, audioBuffer)
        return audioBuffer
      } catch {
        return null
      } finally {
        this.pendingLoads.delete(url)
      }
    })()

    this.pendingLoads.set(url, loadPromise)
    return loadPromise
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

    try {
      const ctx = this.getContext()

      // Must run synchronously within the user gesture, before any await,
      // so the HTMLAudioElement activates in the media channel.
      this.activateOutput()

      // Resume if suspended (mobile browsers)
      if (ctx.state === 'suspended') {
        await ctx.resume()
        if (!this.isCurrentRequest(requestId, url)) return
      }

      const buffer = await this.loadBuffer(url)
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
    } catch {
      if (!this.isCurrentRequest(requestId, url)) return
      this.activeUrl = null
      this.activeBuffer = null
      this.setState('error')
    }
  }
}
