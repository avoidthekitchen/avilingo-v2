import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import IntroQuiz from './IntroQuiz'
import type { AudioPlayer, AudioState } from '../../adapters/audio'
import type { IntroQuizItem, Species } from '../../core/types'

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
    prefetch: vi.fn(async () => null),
    getBuffer: vi.fn(() => null),
    ...overrides,
  }
}

function makeSpecies(id: string): Species {
  return {
    id,
    common_name: id.toUpperCase(),
    scientific_name: `Genus ${id}`,
    family: 'TestFamily',
    ebird_frequency_pct: 50,
    habitat: ['backyard'],
    seasonality: 'year-round',
    mnemonic: `mnemonic for ${id}`,
    sound_types: { song: 'test song', call: 'test call' },
    confuser_species: [],
    confuser_notes: '',
    audio_clips: {
      songs: [
        {
          xc_id: `${id}-song`,
          xc_url: '',
          audio_url: `/${id}.ogg`,
          type: 'song',
          quality: 'A',
          length: '0:10',
          recordist: 'test',
          license: 'CC',
          location: '',
          country: '',
          score: 10,
        },
      ],
      calls: [],
    },
    photo: {
      url: `/${id}.jpg`,
      filename: `${id}.jpg`,
      source: 'test',
      license: 'CC',
      wikipedia_page: '',
    },
  }
}

function makeItem(): IntroQuizItem {
  const target = makeSpecies('a')
  return {
    targetSpecies: target,
    clip: target.audio_clips.songs[0],
    choices: [target, makeSpecies('b'), makeSpecies('c')],
  }
}

let mockAudioPlayer: AudioPlayer

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ audioPlayer: mockAudioPlayer }),
}))

vi.mock('../../hooks/useAudioStateForUrl', () => ({
  useAudioStateForUrl: vi.fn(() => 'idle'),
}))

describe('IntroQuiz back navigation', () => {
  beforeEach(() => {
    mockAudioPlayer = makeMockAudioPlayer()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders an optional Back action and calls it', () => {
    const onBack = vi.fn()

    render(
      <IntroQuiz
        items={[makeItem()]}
        onComplete={vi.fn()}
        onBack={onBack}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('cancels pending auto-advance when Back is pressed after a correct answer', () => {
    vi.useFakeTimers()

    const onBack = vi.fn()
    const onComplete = vi.fn()

    render(
      <IntroQuiz
        items={[makeItem()]}
        onComplete={onComplete}
        onBack={onBack}
      />,
    )

    fireEvent.click(screen.getByText('A').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('clears pending auto-advance on unmount', () => {
    vi.useFakeTimers()

    const onComplete = vi.fn()
    const { unmount } = render(
      <IntroQuiz
        items={[makeItem()]}
        onComplete={onComplete}
      />,
    )

    fireEvent.click(screen.getByText('A').closest('button')!)
    unmount()

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(onComplete).not.toHaveBeenCalled()
  })
})
