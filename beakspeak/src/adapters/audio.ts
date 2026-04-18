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
  private iosUnlocked = false

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext()
      this.gainNode = this.context.createGain()
      this.gainNode.connect(this.context.destination)
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
    this.source = null
  }

  // iOS routes Web Audio through the media channel (not ringer), bypassing silent mode,
  // but only after a silent buffer is played synchronously within a user gesture.
  private unlockIos(ctx: AudioContext) {
    if (this.iosUnlocked) return
    const buf = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
    this.iosUnlocked = true
  }

  private isCurrentRequest(requestId: number, url: string) {
    return this.playRequestId === requestId && this.activeUrl === url
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
    }

    this.gainNode.gain.cancelScheduledValues(this.context.currentTime)
    this.gainNode.gain.setValueAtTime(1, this.context.currentTime)

    this.source = this.context.createBufferSource()
    this.source.buffer = buffer
    this.source.connect(this.gainNode)
    this.source.onended = () => {
      this.source = null
      // Fire idle BEFORE nulling so listeners can see which clip ended
      this.setState('idle')
      this.activeUrl = null
      this.activeBuffer = null
    }
    this.source.start(0, time)
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
      // so iOS routes Web Audio through the media channel.
      this.unlockIos(ctx)

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

      this.source = ctx.createBufferSource()
      this.source.buffer = buffer
      this.source.connect(this.gainNode)
      this.source.onended = () => {
        this.source = null
        // Fire idle BEFORE nulling so listeners can see which clip ended naturally
        this.setState('idle')
        this.activeUrl = null
        this.activeBuffer = null
      }
      this.source.start(0, offset ?? 0)
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
