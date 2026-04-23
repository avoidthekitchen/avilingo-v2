import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import QuizSession from './QuizSession'
import type { Manifest, QuizItem, Species } from '../../core/types'

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
  default: ({ onAnswer }: { onAnswer: (correct: boolean, responseTimeMs: number) => void }) => (
    <button onClick={() => onAnswer(false, 1200)}>Answer Question</button>
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
})
