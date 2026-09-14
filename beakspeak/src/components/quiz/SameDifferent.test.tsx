import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SameDifferent from './SameDifferent'
import type { AudioPlayer, AudioState } from '../../adapters/audio'
import type { AudioClip, QuizItem, Species } from '../../core/types'

let audioPlayer: AudioPlayer

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: { audioPlayer: AudioPlayer }) => unknown) => selector({ audioPlayer }),
}))

function makeClip(id: string): AudioClip {
  return {
    xc_id: id,
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
  }
}

function makeSpecies(id: string): Species {
  const clip = makeClip(`${id}-song`)
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
    audio_clips: { songs: [clip], calls: [] },
    photo: { url: `/${id}.jpg`, filename: `${id}.jpg`, source: 'test', license: 'CC', wikipedia_page: '' },
  }
}

function makeItem(): QuizItem {
  const target = makeSpecies('a')
  return {
    targetSpecies: target,
    secondSpecies: target,
    exerciseType: 'same_different',
    clip: target.audio_clips.songs[0],
    secondClip: makeClip('second'),
    isSame: true,
  }
}

function makeControllablePlayer() {
  let state: AudioState = 'idle'
  let activeUrl: string | null = null
  const listeners = new Set<(nextState: AudioState) => void>()
  const play = vi.fn(async (url: string) => {
    activeUrl = url
    state = 'playing'
    listeners.forEach(listener => listener(state))
  })

  const player: AudioPlayer = {
    play,
    stop: vi.fn(() => {
      activeUrl = null
      state = 'idle'
      listeners.forEach(listener => listener(state))
    }),
    seek: vi.fn(),
    isPlaying: vi.fn(() => state === 'playing'),
    getState: vi.fn(() => state),
    getActiveUrl: vi.fn(() => activeUrl),
    getProgress: vi.fn(() => ({ currentTime: 0, duration: 0 })),
    onStateChange: vi.fn(listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    onProgress: vi.fn(() => () => {}),
    prefetch: vi.fn(async () => null),
    getBuffer: vi.fn(() => null),
  }

  return {
    player,
    play,
    finishNaturally() {
      state = 'idle'
      listeners.forEach(listener => listener(state))
      activeUrl = null
    },
  }
}

describe('SameDifferent audio sequence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('waits for the first clip to finish before starting the second clip', async () => {
    const controlled = makeControllablePlayer()
    audioPlayer = controlled.player

    render(<SameDifferent item={makeItem()} onAnswer={vi.fn()} />)
    await act(async () => { await Promise.resolve() })
    expect(controlled.play).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(controlled.play).toHaveBeenCalledTimes(1)

    await act(async () => {
      controlled.finishNaturally()
      await Promise.resolve()
      vi.advanceTimersByTime(1500)
    })

    expect(controlled.play).toHaveBeenNthCalledWith(2, '/second.ogg')
  })

  it('offers to replay the sequence when automatic playback is blocked', async () => {
    const controlled = makeControllablePlayer()
    controlled.play.mockRejectedValueOnce(new Error('blocked'))
    audioPlayer = controlled.player

    render(<SameDifferent item={makeItem()} onAnswer={vi.fn()} />)
    await act(async () => { await Promise.resolve() })

    const retry = screen.getByRole('button', { name: 'Tap to play both clips' })
    expect(screen.getByText('Audio didn’t play. Tap to try both clips again.')).toBeInTheDocument()

    fireEvent.click(retry)
    await act(async () => { await Promise.resolve() })
    expect(controlled.play).toHaveBeenCalledTimes(2)
  })
})
