import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import QuizSession from './QuizSession'
import type { Manifest, QuizItem, Species } from '../../core/types'
import type { SessionExitGuard } from '../../store/appStore'

const { buildQuizSessionMock } = vi.hoisted(() => ({
  buildQuizSessionMock: vi.fn(),
}))

let mockState: Record<string, unknown>

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockState),
}))

vi.mock('../../core/quiz', () => ({
  buildQuizSession: (...args: unknown[]) => buildQuizSessionMock(...args),
}))

vi.mock('./ThreeChoiceQuiz', () => ({
  default: ({ onAnswer, onAnswerMarked }: {
    onAnswer: (correct: boolean, responseTimeMs: number, chosenId: string) => void
    onAnswerMarked: (correct: boolean, responseTimeMs: number, chosenId: string) => void
  }) => (
    <>
      <button onClick={() => onAnswerMarked(false, 1200, 'b')}>Mark Question</button>
      <button onClick={() => onAnswer(false, 1200, 'b')}>Answer Question</button>
    </>
  ),
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

function makeManifest(): Manifest {
  return {
    version: '1',
    tier: 1,
    region: 'test',
    target_species_count: 3,
    curation_date: '2026-04-22',
    data_sources: {},
    species: ['a', 'b', 'c'].map(makeSpecies),
    confuser_pairs: [],
    lesson_plan: {
      description: 'test',
      lessons: [],
    },
  }
}

function makeQuizItem(): QuizItem {
  const target = makeSpecies('a')
  return {
    targetSpecies: target,
    exerciseType: 'three_choice',
    clip: target.audio_clips.songs[0],
    choices: [target, makeSpecies('b'), makeSpecies('c')],
  }
}

describe('QuizSession practice mode', () => {
  beforeEach(() => {
    buildQuizSessionMock.mockReset()
    buildQuizSessionMock.mockReturnValue([makeQuizItem()])

    mockState = {
      manifest: makeManifest(),
      allProgress: new Map(),
      lastPlayedClipId: new Map(),
      setSessionGuard: vi.fn(),
      requestSessionExit: vi.fn(),
      updateProgress: vi.fn(),
      logConfusion: vi.fn(),
    }
  })

  it('labels practice sessions and keeps them side-effect free', () => {
    render(<QuizSession mode="practice" onComplete={vi.fn()} />)

    expect(screen.getByText('Practice Session')).toBeInTheDocument()
    expect(screen.getByText("This won't change your review schedule")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Answer Question' }))

    expect(mockState.updateProgress).not.toHaveBeenCalled()
    expect(mockState.logConfusion).not.toHaveBeenCalled()
    expect(screen.getByText('Needs More Practice')).toBeInTheDocument()
    expect(screen.getByText(/didn’t change your review schedule|didn't change your review schedule/i)).toBeInTheDocument()
  })
  it('retries a log failure without scheduling or saving the review twice', async () => {
    const log = vi.mocked(mockState.logConfusion as ReturnType<typeof vi.fn>)
    log.mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined)
    render(<QuizSession mode="review" onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Answer Question' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be fully saved')
    expect(mockState.updateProgress).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }))
    await screen.findByText('Needs More Practice')
    expect(mockState.updateProgress).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenNthCalledWith(1, 'a', 'b')
    expect(log).toHaveBeenNthCalledWith(2, 'a', 'b')
  })

  it('retries the same frozen card after a progress write fails', async () => {
    const save = vi.mocked(mockState.updateProgress as ReturnType<typeof vi.fn>)
    save.mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined)
    render(<QuizSession mode="review" onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Answer Question' }))
    await screen.findByRole('alert')
    const firstCard = save.mock.calls[0][1]
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }))
    await screen.findByText('Needs More Practice')
    expect(save).toHaveBeenNthCalledWith(2, 'a', firstCard)
  })


  it('logs a wrong review answer as a confusion between the two specific birds', async () => {
    render(<QuizSession mode="review" onComplete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Answer Question' }))

    await vi.waitFor(() => expect(mockState.logConfusion).toHaveBeenCalledWith('a', 'b'))
    expect(mockState.updateProgress).toHaveBeenCalledTimes(1)
  })

  it('saves a marked answer on exit without advancing to another question', async () => {
    const onComplete = vi.fn()
    render(<QuizSession mode="review" onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark Question' }))
    expect(mockState.updateProgress).not.toHaveBeenCalled()
    const register = vi.mocked(mockState.setSessionGuard as ReturnType<typeof vi.fn>)
    const guard = register.mock.calls.at(-1)![0] as SessionExitGuard
    await act(async () => { expect(await guard.exit()).toBe(true) })
    expect(mockState.updateProgress).toHaveBeenCalledTimes(1)
    expect(mockState.logConfusion).toHaveBeenCalledWith('a', 'b')
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Needs More Practice')).not.toBeInTheDocument()
  })

  it('keeps a failed exit save retryable without double-counting a saved card', async () => {
    const log = vi.mocked(mockState.logConfusion as ReturnType<typeof vi.fn>)
    log.mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined)
    const onComplete = vi.fn()
    render(<QuizSession mode="review" onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark Question' }))
    const register = vi.mocked(mockState.setSessionGuard as ReturnType<typeof vi.fn>)
    const guard = register.mock.calls.at(-1)![0] as SessionExitGuard
    await act(async () => { expect(await guard.exit()).toBe(false) })
    expect(onComplete).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('could not be fully saved')
    await act(async () => { expect(await guard.exit()).toBe(true) })
    expect(mockState.updateProgress).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
