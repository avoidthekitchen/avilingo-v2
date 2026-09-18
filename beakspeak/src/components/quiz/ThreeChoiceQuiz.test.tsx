import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ThreeChoiceQuiz from './ThreeChoiceQuiz'
import type { AudioPlayer, AudioState } from '../../adapters/audio'
import type { QuizItem, Species } from '../../core/types'

let audioPlayer: AudioPlayer
let activeUrl: string | null
let state: AudioState
let listeners: Array<(state: AudioState) => void>

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: { audioPlayer: AudioPlayer }) => unknown) => selector({ audioPlayer }),
}))

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
      songs: [{ xc_id: `${id}-song`, xc_url: '', audio_url: `/${id}.ogg`, type: 'song', quality: 'A', length: '0:05', recordist: 'test', license: 'CC', location: '', country: '', score: 0 }],
      calls: [],
    },
    photo: { url: `/${id}.jpg`, filename: `${id}.jpg`, source: 'test', license: 'CC', wikipedia_page: '' },
  }
}

function makeItem(): QuizItem {
  const target = makeSpecies('a')
  return {
    targetSpecies: target,
    exerciseType: 'three_choice',
    clip: target.audio_clips.songs[0],
    choices: [target, makeSpecies('b'), makeSpecies('c')],
  }
}

function emit(nextState: AudioState, url: string | null) {
  state = nextState
  activeUrl = url
  listeners.forEach(listener => listener(nextState))
}

// Mirrors WebAudioPlayer.finishPlayback: idle fires while the URL is still active.
function endClipNaturally(url: string) {
  emit('idle', url)
  activeUrl = null
}

describe('ThreeChoiceQuiz response timing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    activeUrl = null
    state = 'idle'
    listeners = []
    audioPlayer = {
      play: vi.fn(async (url: string) => { emit('playing', url) }),
      stop: vi.fn(() => { emit('idle', null) }),
      seek: vi.fn(),
      isPlaying: vi.fn(() => state === 'playing'),
      getState: vi.fn(() => state),
      getActiveUrl: vi.fn(() => activeUrl),
      getProgress: vi.fn(() => ({ currentTime: 0, duration: 0 })),
      onStateChange: vi.fn((listener: (state: AudioState) => void) => {
        listeners.push(listener)
        return () => { listeners = listeners.filter(l => l !== listener) }
      }),
      onProgress: vi.fn(() => () => {}),
      prefetch: vi.fn(async () => null),
      getBuffer: vi.fn(() => null),
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('measures the response from the end of the clip, not from mount', async () => {
    const onAnswer = vi.fn()
    render(<ThreeChoiceQuiz item={makeItem()} onAnswer={onAnswer} />)
    await act(async () => { await Promise.resolve() })

    // Five seconds of listening must not count against the learner.
    act(() => { vi.advanceTimersByTime(5000) })
    await act(async () => { endClipNaturally('/a.ogg') })

    act(() => { vi.advanceTimersByTime(3000) })
    fireEvent.click(screen.getByText('A').closest('button')!)
    act(() => { vi.advanceTimersByTime(1500) })

    expect(onAnswer).toHaveBeenCalledTimes(1)
    const [correct, responseTime] = onAnswer.mock.calls[0]
    expect(correct).toBe(true)
    expect(responseTime).toBeGreaterThanOrEqual(3000)
    expect(responseTime).toBeLessThan(4000)
  })

  it('treats an answer given before the clip ends as an immediate recall', async () => {
    const onAnswer = vi.fn()
    render(<ThreeChoiceQuiz item={makeItem()} onAnswer={onAnswer} />)
    await act(async () => { await Promise.resolve() })

    act(() => { vi.advanceTimersByTime(2000) })
    fireEvent.click(screen.getByText('A').closest('button')!)
    act(() => { vi.advanceTimersByTime(1500) })

    expect(onAnswer).toHaveBeenCalledWith(true, 0)
  })

  it('starts timing when playback is blocked so the learner is not penalised', async () => {
    audioPlayer.play = vi.fn(async () => { throw new Error('blocked') })
    const onAnswer = vi.fn()
    render(<ThreeChoiceQuiz item={makeItem()} onAnswer={onAnswer} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    act(() => { vi.advanceTimersByTime(2000) })
    fireEvent.click(screen.getByText('B').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(onAnswer).toHaveBeenCalledTimes(1)
    const [correct, responseTime] = onAnswer.mock.calls[0]
    expect(correct).toBe(false)
    expect(responseTime).toBeGreaterThanOrEqual(2000)
  })
})
