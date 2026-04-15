export type AudioState = 'idle' | 'loading' | 'playing' | 'error'

export interface AudioPlayer {
  play(url: string): Promise<void>
  stop(): void
  isPlaying(): boolean
  getState(): AudioState
  onStateChange(callback: (state: AudioState) => void): () => void
  prefetch(url: string): void
}

export class WebAudioPlayer implements AudioPlayer {
  private context: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private cache = new Map<string, AudioBuffer>()
  private state: AudioState = 'idle'
  private listeners: Array<(state: AudioState) => void> = []

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext()
    }
    return this.context
  }

  private setState(state: AudioState) {
    this.state = state
    this.listeners.forEach(cb => cb(state))
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

  stop() {
    if (this.source) {
      try { this.source.stop() } catch { /* already stopped */ }
      this.source = null
    }
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

  async play(url: string): Promise<void> {
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

      this.source = ctx.createBufferSource()
      this.source.buffer = buffer
      this.source.connect(ctx.destination)
      this.source.onended = () => {
        this.source = null
        this.setState('idle')
      }
      this.source.start()
      this.setState('playing')
    } catch {
      this.setState('error')
    }
  }
}
