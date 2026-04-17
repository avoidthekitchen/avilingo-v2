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
  prefetch(url: string): void
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

  stop() {
    if (this.source) {
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
    // Null activeUrl BEFORE idle so explicit stop doesn't advance clips
    this.activeUrl = null
    this.activeBuffer = null
    this.setState('idle')
  }

  async prefetch(url: string) {
    if (this.cache.has(url)) return
    try {
      const ctx = this.getContext()
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      this.cache.set(url, audioBuffer)
    } catch {
      // Prefetch failures are silent
    }
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
    this.stop()
    this.setState('loading')

    try {
      const ctx = this.getContext()

      // Resume if suspended (mobile browsers)
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      let buffer = this.cache.get(url)
      if (!buffer) {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`)
        const arrayBuffer = await response.arrayBuffer()
        buffer = await ctx.decodeAudioData(arrayBuffer)
        this.cache.set(url, buffer)
      }

      // Reset gain to full volume before starting new clip.
      // cancelScheduledValues clears any pending fade-out ramp from a prior stop().
      this.gainNode!.gain.cancelScheduledValues(ctx.currentTime)
      this.gainNode!.gain.setValueAtTime(1, ctx.currentTime)

      this.source = ctx.createBufferSource()
      this.source.buffer = buffer
      this.source.connect(this.gainNode!)
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
      this.activeUrl = url
      this.setState('playing')
    } catch {
      this.setState('error')
    }
  }
}
