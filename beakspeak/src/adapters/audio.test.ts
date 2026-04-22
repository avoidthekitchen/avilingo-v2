import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebAudioPlayer } from './audio'

// --- Web Audio API mocks ---

function makeMockSource(): AudioBufferSourceNode {
  const source = {
    buffer: null as AudioBuffer | null,
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as ((ev: Event) => void) | null,
    disconnect: vi.fn(),
  }
  return source as unknown as AudioBufferSourceNode
}

function makeMockGainNode(): GainNode {
  const gain = {
    value: 1,
    setValueAtTime: vi.fn().mockReturnThis(),
    linearRampToValueAtTime: vi.fn().mockReturnThis(),
    cancelScheduledValues: vi.fn().mockReturnThis(),
  }
  return { gain, connect: vi.fn(), disconnect: vi.fn() } as unknown as GainNode
}

function makeMockBuffer(duration = 10): AudioBuffer {
  return {
    duration,
    length: duration * 44100,
    sampleRate: 44100,
    numberOfChannels: 1,
    getChannelData: vi.fn(() => new Float32Array(duration * 44100)),
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer
}

function setupFetchMock() {
  const arrayBuffer = new ArrayBuffer(8)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(arrayBuffer),
  }))
}

let mockSources: ReturnType<typeof makeMockSource>[]
let mockGainNode: ReturnType<typeof makeMockGainNode>
let mockBuffer: AudioBuffer
let mockAudioEl: {
  play: ReturnType<typeof vi.fn>
  setAttribute: ReturnType<typeof vi.fn>
  srcObject: unknown
  style: { display: string }
}

function setupAudioContextMock() {
  mockSources = []
  mockGainNode = makeMockGainNode()
  mockBuffer = makeMockBuffer()

  const mockStreamDest = {
    stream: { id: 'mock-stream' },
  }

  const mockContext = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createBufferSource: vi.fn(() => {
      const src = makeMockSource()
      mockSources.push(src)
      return src
    }),
    createGain: vi.fn(() => mockGainNode),
    createMediaStreamDestination: vi.fn(() => mockStreamDest),
    decodeAudioData: vi.fn().mockResolvedValue(mockBuffer),
  }

  mockAudioEl = {
    play: vi.fn().mockResolvedValue(undefined),
    setAttribute: vi.fn(),
    srcObject: null,
    style: { display: '' },
  }
  const origCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'audio') return mockAudioEl as unknown as HTMLElement
    return origCreateElement(tag)
  })
  vi.spyOn(document.body, 'appendChild').mockImplementation(((node: Node) => node) as typeof document.body.appendChild)

  vi.stubGlobal('AudioContext', class MockAudioContext {
    state = mockContext.state
    currentTime = mockContext.currentTime
    destination = mockContext.destination
    resume = mockContext.resume
    createBufferSource = mockContext.createBufferSource
    createGain = mockContext.createGain
    createMediaStreamDestination = mockContext.createMediaStreamDestination
    decodeAudioData = mockContext.decodeAudioData
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  setupAudioContextMock()
  setupFetchMock()
})

describe('WebAudioPlayer', () => {
  describe('getActiveUrl', () => {
    it('returns null when nothing has played', () => {
      const player = new WebAudioPlayer()
      expect(player.getActiveUrl()).toBeNull()
    })

    it('returns the URL after play()', async () => {
      const player = new WebAudioPlayer()
      await player.play('https://example.com/song.ogg')
      expect(player.getActiveUrl()).toBe('https://example.com/song.ogg')
    })

    it('returns null after stop()', async () => {
      const player = new WebAudioPlayer()
      await player.play('https://example.com/song.ogg')
      player.stop()
      expect(player.getActiveUrl()).toBeNull()
    })

    it('returns the new URL when switching clips', async () => {
      const player = new WebAudioPlayer()
      await player.play('https://example.com/song.ogg')
      await player.play('https://example.com/call.ogg')
      expect(player.getActiveUrl()).toBe('https://example.com/call.ogg')
      expect(player.getState()).toBe('playing')
    })

    it('tracks the requested URL while a clip is loading', async () => {
      let resolveFetch!: (value: Response | PromiseLike<Response>) => void
      vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => {
        resolveFetch = resolve as typeof resolveFetch
      })))

      const player = new WebAudioPlayer()
      const playPromise = player.play('https://example.com/song.ogg')

      expect(player.getState()).toBe('loading')
      expect(player.getActiveUrl()).toBe('https://example.com/song.ogg')

      resolveFetch({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      } as Response)
      await playPromise
    })
  })

  describe('state transitions', () => {
    it('transitions through idle → loading → playing during play()', async () => {
      const player = new WebAudioPlayer()
      const states: string[] = []
      player.onStateChange(s => states.push(s))

      await player.play('https://example.com/song.ogg')

      expect(states).toEqual(['idle', 'loading', 'playing'])
    })

    it('transitions to idle on stop()', async () => {
      const player = new WebAudioPlayer()
      await player.play('https://example.com/song.ogg')

      const states: string[] = []
      player.onStateChange(s => states.push(s))
      player.stop()

      expect(states).toEqual(['idle'])
      expect(player.getState()).toBe('idle')
    })

    it('clears activeUrl when clip ends naturally (onended)', async () => {
      const player = new WebAudioPlayer()
      await player.play('https://example.com/song.ogg')
      expect(player.getActiveUrl()).toBe('https://example.com/song.ogg')

      // Simulate the clip ending naturally
      const source = mockSources[mockSources.length - 1]
      source.onended!(new Event('ended'))

      expect(player.getActiveUrl()).toBeNull()
      expect(player.getState()).toBe('idle')
    })

    it('does not restart playback after stop() cancels an in-flight play()', async () => {
      let resolveFetch!: (value: Response | PromiseLike<Response>) => void
      vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => {
        resolveFetch = resolve as typeof resolveFetch
      })))

      const player = new WebAudioPlayer()
      const states: string[] = []
      player.onStateChange(s => states.push(s))

      const playPromise = player.play('https://example.com/song.ogg')
      expect(player.getState()).toBe('loading')

      player.stop()
      resolveFetch({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      } as Response)
      await playPromise

      expect(player.getState()).toBe('idle')
      expect(player.getActiveUrl()).toBeNull()
      expect(mockSources).toHaveLength(0)
      expect(states).toEqual(['idle', 'loading', 'idle'])
    })
  })

  describe('getBuffer', () => {
    it('returns null for a URL that has never been played', () => {
      const player = new WebAudioPlayer()
      expect(player.getBuffer('https://example.com/unknown.ogg')).toBeNull()
    })

    it('returns the cached AudioBuffer after play()', async () => {
      const player = new WebAudioPlayer()
      await player.play('https://example.com/song.ogg')
      expect(player.getBuffer('https://example.com/song.ogg')).toBe(mockBuffer)
    })
  })

  describe('getProgress', () => {
    it('returns zeros when idle', () => {
      const player = new WebAudioPlayer()
      expect(player.getProgress()).toEqual({ currentTime: 0, duration: 0 })
    })

    it('reflects offset after play(url, offset)', async () => {
      const player = new WebAudioPlayer()
      await player.play('https://example.com/song.ogg', 5.0)
      const progress = player.getProgress()
      expect(progress.currentTime).toBeCloseTo(5.0, 1)
      expect(progress.duration).toBe(mockBuffer.duration)

      // Verify the offset was passed to source.start
      const lastSource = mockSources[mockSources.length - 1]
      expect(lastSource.start).toHaveBeenCalledWith(0, 5.0)
    })

    it('reports zero elapsed time at start of playback', async () => {
      const player = new WebAudioPlayer()
      await player.play('https://example.com/song.ogg')
      expect(player.getProgress().currentTime).toBeCloseTo(0, 1)
      expect(player.getProgress().duration).toBe(mockBuffer.duration)
    })

    it('returns zeros after stop()', async () => {
      const player = new WebAudioPlayer()
      await player.play('https://example.com/song.ogg', 3.0)
      player.stop()
      expect(player.getProgress()).toEqual({ currentTime: 0, duration: 0 })
    })
  })

  describe('seek', () => {
    it('is a no-op when stopped', () => {
      const player = new WebAudioPlayer()
      player.seek(10.0)
      expect(player.getActiveUrl()).toBeNull()
      expect(player.getState()).toBe('idle')
      expect(player.getProgress()).toEqual({ currentTime: 0, duration: 0 })
    })

    it('restarts playback at the new offset while playing', async () => {
      const player = new WebAudioPlayer()
      await player.play('https://example.com/song.ogg')
      expect(player.getActiveUrl()).toBe('https://example.com/song.ogg')

      await player.seek(10.0)
      expect(player.getActiveUrl()).toBe('https://example.com/song.ogg')
      expect(player.getState()).toBe('playing')
      expect(player.getProgress().currentTime).toBeCloseTo(10.0, 1)
      expect(player.getProgress().duration).toBe(mockBuffer.duration)
    })

    it('passes the offset to source.start()', async () => {
      const player = new WebAudioPlayer()
      await player.play('https://example.com/song.ogg')
      const countBefore = mockSources.length

      await player.seek(7.5)

      // A new source should have been created for the seek
      expect(mockSources.length).toBe(countBefore + 1)
      const lastSource = mockSources[mockSources.length - 1]
      expect(lastSource.start).toHaveBeenCalledWith(0, 7.5)
    })
  })

  describe('onProgress', () => {
    it('fires callback during playback via requestAnimationFrame', async () => {
      // Mock requestAnimationFrame to capture and invoke callbacks
      const rafCallbacks: FrameRequestCallback[] = []
      vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      }))
      vi.stubGlobal('cancelAnimationFrame', vi.fn())

      const player = new WebAudioPlayer()
      const progressCalls: Array<{ currentTime: number; duration: number }> = []
      player.onProgress((currentTime, duration) => {
        progressCalls.push({ currentTime, duration })
      })

      await player.play('https://example.com/song.ogg')

      // Trigger one rAF tick
      expect(rafCallbacks.length).toBeGreaterThan(0)
      rafCallbacks[rafCallbacks.length - 1](performance.now())

      expect(progressCalls.length).toBeGreaterThanOrEqual(1)
      expect(progressCalls[0].duration).toBe(mockBuffer.duration)
    })

    it('stops firing after unsubscribe', async () => {
      const rafCallbacks: FrameRequestCallback[] = []
      vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      }))
      vi.stubGlobal('cancelAnimationFrame', vi.fn())

      const player = new WebAudioPlayer()
      const progressCalls: Array<{ currentTime: number; duration: number }> = []
      const unsub = player.onProgress((currentTime, duration) => {
        progressCalls.push({ currentTime, duration })
      })

      await player.play('https://example.com/song.ogg')

      // Trigger one tick, should fire
      if (rafCallbacks.length > 0) {
        rafCallbacks[rafCallbacks.length - 1](performance.now())
      }
      const countAfterFirst = progressCalls.length

      unsub()

      // Trigger another tick, should NOT fire for this subscriber
      if (rafCallbacks.length > 0) {
        rafCallbacks[rafCallbacks.length - 1](performance.now())
      }
      expect(progressCalls.length).toBe(countAfterFirst)
    })
  })

  describe('iOS media-channel routing', () => {
    // Regression: play() on the HTMLAudioElement must fire synchronously inside
    // the user gesture, before any await. Otherwise iOS routes through the ringer
    // channel and audio is silenced when the device is on silent mode.
    it('activates the audio element synchronously before any await', () => {
      const player = new WebAudioPlayer()
      void player.play('https://example.com/song.ogg')
      expect(mockAudioEl.play).toHaveBeenCalled()
    })
  })
})
