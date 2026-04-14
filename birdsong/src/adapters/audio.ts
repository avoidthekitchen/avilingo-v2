export interface AudioPlayer {
  play(url: string): Promise<void>;
  stop(): void;
  isPlaying(): boolean;
  preload(url: string): Promise<void>;
  onStateChange?: (playing: boolean) => void;
}

export class WebAudioPlayer implements AudioPlayer {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private cache = new Map<string, AudioBuffer>();
  private _playing = false;
  private currentUrl: string | null = null;
  onStateChange?: (playing: boolean) => void;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private setPlaying(v: boolean) {
    this._playing = v;
    this.onStateChange?.(v);
  }

  async preload(url: string): Promise<void> {
    if (this.cache.has(url)) return;
    try {
      const resp = await fetch(url);
      const arrayBuf = await resp.arrayBuffer();
      const ctx = this.getCtx();
      const buffer = await ctx.decodeAudioData(arrayBuf);
      this.cache.set(url, buffer);
    } catch {
      // preloading is best-effort
    }
  }

  async play(url: string): Promise<void> {
    this.stop();
    this.currentUrl = url;
    this.setPlaying(true);

    try {
      let buffer = this.cache.get(url);
      if (!buffer) {
        const resp = await fetch(url);
        const arrayBuf = await resp.arrayBuffer();
        const ctx = this.getCtx();
        buffer = await ctx.decodeAudioData(arrayBuf);
        this.cache.set(url, buffer);
      }

      if (this.currentUrl !== url) return;

      const ctx = this.getCtx();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (this.currentUrl === url) {
          this.setPlaying(false);
          this.currentUrl = null;
        }
      };
      this.source = source;
      source.start(0);
    } catch {
      this.setPlaying(false);
      this.currentUrl = null;
    }
  }

  stop(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // already stopped
      }
      this.source = null;
    }
    this.currentUrl = null;
    this.setPlaying(false);
  }

  isPlaying(): boolean {
    return this._playing;
  }
}
