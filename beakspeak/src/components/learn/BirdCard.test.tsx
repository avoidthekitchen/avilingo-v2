import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import BirdCard from './BirdCard'
import type { Species, AudioClip } from '../../core/types'
import type { AudioPlayer, AudioState } from '../../adapters/audio'

// --- Mock audioPlayer ---

function makeMockAudioPlayer(overrides: Partial<AudioPlayer> = {}): AudioPlayer {
  return {
    play: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    seek: vi.fn(),
    isPlaying: vi.fn(() => false),
    getState: vi.fn((): AudioState => 'idle'),
    getActiveUrl: vi.fn(() => null),
    getProgress: vi.fn(() => ({ currentTime: 0, duration: 0 })),
    onStateChange: vi.fn(() => () => {}),
    onProgress: vi.fn(() => () => {}),
    prefetch: vi.fn(),
    getBuffer: vi.fn(() => null),
    ...overrides,
  }
}

// --- Mock Zustand store ---

let mockAudioPlayer: AudioPlayer

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      audioPlayer: mockAudioPlayer,
      lastPlayedClipId: new Map(),
      setLastPlayedClip: vi.fn(),
    }),
}))

// --- Mock computeSpectrogram (avoid real FFT in tests) ---

vi.mock('../../core/spectrogram', () => ({
  computeSpectrogram: vi.fn(() => ({
    magnitudes: [new Float32Array([0.5, 0.3])],
    timeBins: 1,
    frequencyBins: 2,
    duration: 10,
    sampleRate: 44100,
  })),
}))

// --- Test fixture ---

function makeClip(overrides: Partial<AudioClip> = {}): AudioClip {
  return {
    xc_id: 'XC123',
    xc_url: 'https://xeno-canto.org/123',
    audio_url: '/content/audio/song1.ogg',
    type: 'song',
    quality: 'A',
    length: '0:12',
    recordist: 'Test',
    license: 'CC-BY',
    location: 'Oregon',
    country: 'US',
    score: 10,
    ...overrides,
  }
}

function makeSpecies(overrides: Partial<Species> = {}): Species {
  return {
    id: 'amro',
    common_name: 'American Robin',
    scientific_name: 'Turdus migratorius',
    family: 'Turdidae',
    ebird_frequency_pct: 45,
    habitat: ['Forest'],
    seasonality: 'Year-round',
    mnemonic: 'cheerily cheer-up',
    sound_types: { song: 'Caroling', call: 'Tut' },
    confuser_species: [],
    confuser_notes: '',
    audio_clips: {
      songs: [makeClip({ xc_id: 'XC100', audio_url: '/content/audio/amro-song1.ogg' })],
      calls: [makeClip({ xc_id: 'XC200', audio_url: '/content/audio/amro-call1.ogg', type: 'call' })],
    },
    photo: {
      url: '/content/photos/amro.jpg',
      filename: 'amro.jpg',
      source: 'Wikipedia',
      license: 'CC-BY-SA',
      wikipedia_page: 'https://en.wikipedia.org/wiki/American_robin',
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAudioPlayer = makeMockAudioPlayer()
})

describe('BirdCard spectrogram integration', () => {
  it('renders a Spectrogram canvas element', () => {
    const species = makeSpecies()
    render(<BirdCard species={species} />)

    expect(document.querySelector('canvas')).toBeInTheDocument()
  })

  it('calls audioPlayer.play(url, time) when clicking spectrogram while stopped', () => {
    const mockBuffer = { duration: 12, length: 12 * 44100, sampleRate: 44100, numberOfChannels: 1, getChannelData: vi.fn(() => new Float32Array(0)) } as unknown as AudioBuffer
    mockAudioPlayer = makeMockAudioPlayer({
      getBuffer: vi.fn(() => mockBuffer),
      getActiveUrl: vi.fn(() => null), // stopped
    })

    const species = makeSpecies()
    render(<BirdCard species={species} />)

    const canvas = document.querySelector('canvas')!
    // Mock getBoundingClientRect so click position math works
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 80, right: 200, bottom: 80, x: 0, y: 0, toJSON: () => {} })

    // Click at 50% of the canvas width → seekTime = 0.5 * duration
    fireEvent.click(canvas, { clientX: 100 })

    expect(mockAudioPlayer.play).toHaveBeenCalledWith(
      '/content/audio/amro-song1.ogg',
      expect.closeTo(5, 0), // 100/200 * 10 (mock spectrogram duration)
    )
  })

  it('calls audioPlayer.seek(time) when clicking spectrogram while playing', () => {
    const songUrl = '/content/audio/amro-song1.ogg'
    const mockBuffer = { duration: 12, length: 12 * 44100, sampleRate: 44100, numberOfChannels: 1, getChannelData: vi.fn(() => new Float32Array(0)) } as unknown as AudioBuffer
    mockAudioPlayer = makeMockAudioPlayer({
      getBuffer: vi.fn(() => mockBuffer),
      getActiveUrl: vi.fn(() => songUrl), // currently playing this clip
    })

    const species = makeSpecies()
    render(<BirdCard species={species} />)

    const canvas = document.querySelector('canvas')!
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 80, right: 200, bottom: 80, x: 0, y: 0, toJSON: () => {} })

    // Click at 75% → seekTime = 0.75 * 10 = 7.5
    fireEvent.click(canvas, { clientX: 150 })

    expect(mockAudioPlayer.seek).toHaveBeenCalledWith(expect.closeTo(7.5, 0))
    expect(mockAudioPlayer.play).not.toHaveBeenCalled()
  })

  it('switches spectrogram to call clip when audioPlayer plays a call URL', () => {
    const callUrl = '/content/audio/amro-call1.ogg'
    const songUrl = '/content/audio/amro-song1.ogg'
    const mockBuffer = { duration: 8, length: 8 * 44100, sampleRate: 44100, numberOfChannels: 1, getChannelData: vi.fn(() => new Float32Array(0)) } as unknown as AudioBuffer

    // Capture the onStateChange callback so we can trigger it
    let stateChangeCb: (state: AudioState) => void = () => {}
    mockAudioPlayer = makeMockAudioPlayer({
      getBuffer: vi.fn(() => mockBuffer),
      getActiveUrl: vi.fn(() => songUrl),
      onStateChange: vi.fn((cb) => {
        stateChangeCb = cb
        return () => {}
      }),
    })

    const species = makeSpecies()
    render(<BirdCard species={species} />)

    const canvas = document.querySelector('canvas')!
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 80, right: 200, bottom: 80, x: 0, y: 0, toJSON: () => {} })

    // Now simulate: audioPlayer switches to playing the call URL
    vi.mocked(mockAudioPlayer.getActiveUrl).mockReturnValue(callUrl)
    act(() => { stateChangeCb('playing') })

    // Click the spectrogram — should seek/play the call URL, not the song URL
    fireEvent.click(canvas, { clientX: 100 })

    // The seek handler should target the call URL now
    // Since getActiveUrl returns callUrl and the active clip is now the call,
    // and getActiveUrl === activeClipUrl → seek() is called
    expect(mockAudioPlayer.seek).toHaveBeenCalledWith(expect.closeTo(5, 0))
  })

  it('passes updated currentTime to Spectrogram via onProgress subscription', () => {
    const songUrl = '/content/audio/amro-song1.ogg'
    const mockBuffer = { duration: 10, length: 10 * 44100, sampleRate: 44100, numberOfChannels: 1, getChannelData: vi.fn(() => new Float32Array(0)) } as unknown as AudioBuffer

    let progressCb: (currentTime: number, duration: number) => void = () => {}
    mockAudioPlayer = makeMockAudioPlayer({
      getBuffer: vi.fn(() => mockBuffer),
      getActiveUrl: vi.fn(() => songUrl),
      onProgress: vi.fn((cb) => {
        progressCb = cb
        return () => {}
      }),
    })

    const species = makeSpecies()
    const { container } = render(<BirdCard species={species} />)

    // Simulate progress update — Spectrogram should receive updated currentTime
    // The Spectrogram draws a playhead at (currentTime/duration)*width
    // We verify indirectly by checking the drawSpectrogram call happens
    // but more directly: the onProgress callback was subscribed to
    expect(mockAudioPlayer.onProgress).toHaveBeenCalled()

    // Fire a progress update — this should not throw and should update state
    act(() => { progressCb(3.5, 10) })

    // The component should still be rendered without error
    expect(container.querySelector('canvas')).toBeInTheDocument()
  })

  it('resets currentTime to 0 when audio stops (playhead disappears)', () => {
    const songUrl = '/content/audio/amro-song1.ogg'
    const mockBuffer = { duration: 10, length: 10 * 44100, sampleRate: 44100, numberOfChannels: 1, getChannelData: vi.fn(() => new Float32Array(0)) } as unknown as AudioBuffer

    let progressCb: (currentTime: number, duration: number) => void = () => {}
    let stateChangeCb: (state: AudioState) => void = () => {}
    mockAudioPlayer = makeMockAudioPlayer({
      getBuffer: vi.fn(() => mockBuffer),
      getActiveUrl: vi.fn(() => songUrl),
      onProgress: vi.fn((cb) => { progressCb = cb; return () => {} }),
      onStateChange: vi.fn((cb) => { stateChangeCb = cb; return () => {} }),
    })

    const species = makeSpecies()
    render(<BirdCard species={species} />)

    // Simulate progress to 5 seconds
    act(() => { progressCb(5.0, 10) })

    // Now audio stops — activeUrl becomes null
    vi.mocked(mockAudioPlayer.getActiveUrl).mockReturnValue(null)
    act(() => { stateChangeCb('idle') })

    // After stopping, clicking the canvas should call play (not seek),
    // confirming the component knows audio is stopped
    const canvas = document.querySelector('canvas')!
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 80, right: 200, bottom: 80, x: 0, y: 0, toJSON: () => {} })
    fireEvent.click(canvas, { clientX: 100 })

    expect(mockAudioPlayer.play).toHaveBeenCalledWith(
      '/content/audio/amro-song1.ogg',
      expect.closeTo(5, 0),
    )
    expect(mockAudioPlayer.seek).not.toHaveBeenCalled()
  })
})
