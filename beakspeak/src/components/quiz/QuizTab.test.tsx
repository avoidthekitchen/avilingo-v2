import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import QuizTab from './QuizTab'
import type { Lesson, Manifest, Species } from '../../core/types'

const { quizSessionMock } = vi.hoisted(() => ({
  quizSessionMock: vi.fn(({ mode }: { mode: 'review' | 'practice' }) => (
    <div data-testid="quiz-session">{mode}</div>
  )),
}))

let mockState: Record<string, unknown>

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockState),
}))

vi.mock('./QuizSession', () => ({
  default: (props: { mode: 'review' | 'practice' }) => quizSessionMock(props),
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

function makeLesson(lesson: number, speciesIds: string[]): Lesson {
  return { lesson, title: `Lesson ${lesson}`, species: speciesIds, rationale: 'test' }
}

function makeManifest(): Manifest {
  const species = ['a', 'b', 'c', 'd', 'e', 'f'].map(makeSpecies)

  return {
    version: '1',
    tier: 1,
    region: 'test',
    target_species_count: species.length,
    curation_date: '2026-04-22',
    data_sources: {},
    species,
    confuser_pairs: [],
    lesson_plan: {
      description: 'test',
      lessons: [
        makeLesson(1, ['a', 'b', 'c']),
        makeLesson(2, ['d', 'e', 'f']),
      ],
    },
  }
}

describe('QuizTab practice entry', () => {
  beforeEach(() => {
    quizSessionMock.mockClear()
    mockState = {
      manifest: makeManifest(),
      allProgress: new Map(),
      getIntroducedSpecies: () => ['a', 'b', 'c'].map(makeSpecies),
      getDueForReview: () => [],
      hasRelearning: () => false,
      getCompletedLessons: () => [1],
      setTab: vi.fn(),
    }
  })

  it('offers practice as a secondary action when learning is still available', () => {
    render(<QuizTab />)

    expect(screen.getByRole('button', { name: 'Learn More Birds' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Practice Anyway' }))

    expect(screen.getByTestId('quiz-session')).toHaveTextContent('practice')
  })

  it('offers practice as the only action when relearning blocks learning', () => {
    mockState = {
      ...mockState,
      hasRelearning: () => true,
    }

    render(<QuizTab />)

    expect(screen.getByText("Some birds need more practice. Come back when they're due.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Learn More Birds' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Practice Anyway' }))

    expect(screen.getByTestId('quiz-session')).toHaveTextContent('practice')
  })

  it('does not offer practice when birds are due for review', () => {
    mockState = {
      ...mockState,
      getDueForReview: () => [{ speciesId: 'a' }],
    }

    render(<QuizTab />)

    expect(screen.getByRole('button', { name: 'Start Review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Practice Anyway' })).not.toBeInTheDocument()
  })

  it('does not offer practice when fewer than three birds are introduced', () => {
    mockState = {
      ...mockState,
      getIntroducedSpecies: () => ['a', 'b'].map(makeSpecies),
    }

    render(<QuizTab />)

    expect(screen.getByRole('button', { name: 'Learn More Birds' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Practice Anyway' })).not.toBeInTheDocument()
  })

  it('offers practice as the only action when all lessons are complete', () => {
    mockState = {
      ...mockState,
      getCompletedLessons: () => [1, 2],
    }

    render(<QuizTab />)

    expect(screen.getByRole('button', { name: 'Practice Anyway' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Learn More Birds' })).not.toBeInTheDocument()
  })
})
