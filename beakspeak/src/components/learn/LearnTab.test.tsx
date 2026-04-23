import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import LearnTab from './LearnTab'
import type { Lesson, Manifest, Species, UserProgress } from '../../core/types'

const { learnSessionMock } = vi.hoisted(() => ({
  learnSessionMock: vi.fn(({ lesson, mode, onComplete }: { lesson: Lesson; mode?: string; onComplete?: () => void }) => (
    <div data-testid="learn-session">
      {lesson.title}::{mode ?? 'normal'}
      <button onClick={onComplete}>Exit Session</button>
    </div>
  )),
}))

let mockState: Record<string, unknown>

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockState),
}))

vi.mock('./LearnSession', () => ({
  default: (props: { lesson: Lesson; mode?: string; onComplete?: () => void }) => learnSessionMock(props),
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
  const species = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(makeSpecies)

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
        makeLesson(3, ['g', 'h', 'i']),
      ],
    },
  }
}

function makeProgress(speciesId: string, overrides: Partial<UserProgress> = {}): UserProgress {
  return {
    speciesId,
    introduced: false,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    ...overrides,
  }
}

function makeStoreState(progressEntries: Array<[string, UserProgress]> = []) {
  const manifest = makeManifest()
  const allProgress = new Map<string, UserProgress>(progressEntries)
  const introduceSpecies = vi.fn(async (speciesIds: string[]) => {
    const updated = new Map(allProgress)
    const now = Date.now()

    for (const speciesId of speciesIds) {
      const existing = updated.get(speciesId)
      updated.set(
        speciesId,
        existing
          ? { ...existing, introduced: true, introducedAt: existing.introducedAt ?? now }
          : makeProgress(speciesId, { introduced: true, introducedAt: now }),
      )
    }

    mockState = { ...mockState, allProgress: updated }
  })

  return {
    manifest,
    allProgress,
    introduceSpecies,
    getCompletedLessons: () =>
      manifest.lesson_plan.lessons
        .filter(lesson =>
          lesson.species.every(
            speciesId => (mockState.allProgress as Map<string, UserProgress>).get(speciesId)?.introduced,
          ),
        )
        .map(lesson => lesson.lesson),
    getIntroducedSpecies: () =>
      manifest.species.filter(
        species => (mockState.allProgress as Map<string, UserProgress>).get(species.id)?.introduced,
      ),
  }
}

describe('LearnTab locked lesson dialog', () => {
  beforeEach(() => {
    learnSessionMock.mockClear()
    mockState = makeStoreState()
  })

  it('opens a dialog when a locked lesson is clicked', () => {
    render(<LearnTab />)

    fireEvent.click(screen.getByRole('button', { name: /lesson 2: lesson 2/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Take It Step by Step')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip Ahead Anyway' })).toBeInTheDocument()
  })

  it('uses relearning framing when relearning and prerequisite locks both apply', () => {
    mockState = makeStoreState([
      ['x', makeProgress('x', { introduced: true, state: 'relearning' })],
    ])

    render(<LearnTab />)

    fireEvent.click(screen.getByRole('button', { name: /lesson 2: lesson 2/i }))

    expect(screen.getByText('Practice First')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Lesson Anyway' })).toBeInTheDocument()
    expect(screen.queryByText('Take It Step by Step')).not.toBeInTheDocument()
  })

  it('closes the dialog when Never mind is clicked', () => {
    render(<LearnTab />)

    fireEvent.click(screen.getByRole('button', { name: /lesson 2: lesson 2/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Never mind' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the dialog when the backdrop is clicked', () => {
    render(<LearnTab />)

    fireEvent.click(screen.getByRole('button', { name: /lesson 2: lesson 2/i }))
    fireEvent.click(screen.getByTestId('unlock-dialog-backdrop'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('launches a completed lesson in redo mode', () => {
    mockState = makeStoreState([
      ['a', makeProgress('a', { introduced: true })],
      ['b', makeProgress('b', { introduced: true })],
      ['c', makeProgress('c', { introduced: true })],
    ])

    render(<LearnTab />)

    fireEvent.click(screen.getByRole('button', { name: /lesson 1: lesson 1/i }))

    expect(screen.getByTestId('learn-session')).toHaveTextContent('Lesson 1::redo')
  })

  it('allows completed lessons to relaunch during relearning', () => {
    mockState = makeStoreState([
      ['a', makeProgress('a', { introduced: true })],
      ['b', makeProgress('b', { introduced: true })],
      ['c', makeProgress('c', { introduced: true })],
      ['x', makeProgress('x', { introduced: true, state: 'relearning' })],
    ])

    render(<LearnTab />)

    fireEvent.click(screen.getByRole('button', { name: /lesson 1: lesson 1/i }))

    expect(screen.getByTestId('learn-session')).toHaveTextContent('Lesson 1::redo')
  })

  it('confirms a locked lesson by introducing skipped lessons and launching unlock mode', async () => {
    mockState = makeStoreState([
      ['a', makeProgress('a', { introduced: true })],
      ['b', makeProgress('b', { introduced: true })],
      ['c', makeProgress('c', { introduced: true })],
      ['e', makeProgress('e', {
        introduced: true,
        introducedAt: 123,
        reps: 5,
        state: 'review',
        scheduledDays: 10,
        elapsedDays: 3,
      })],
    ])

    render(<LearnTab />)

    fireEvent.click(screen.getByRole('button', { name: /lesson 3: lesson 3/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip Ahead Anyway' }))

    await waitFor(() => {
      expect((mockState.introduceSpecies as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(['d', 'e', 'f'])
    })

    expect(screen.getByTestId('learn-session')).toHaveTextContent('Lesson 3::unlock')

    const progress = mockState.allProgress as Map<string, UserProgress>
    expect(progress.get('d')?.introduced).toBe(true)
    expect(progress.get('f')?.introduced).toBe(true)
    expect(progress.get('e')).toMatchObject({
      introduced: true,
      introducedAt: 123,
      reps: 5,
      state: 'review',
      scheduledDays: 10,
      elapsedDays: 3,
    })
    expect((mockState.introduceSpecies as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toContain('g')
  })

  it('requires confirmation again after backing out of an unlock launch when relearning still applies', async () => {
    mockState = makeStoreState([
      ['a', makeProgress('a', { introduced: true })],
      ['b', makeProgress('b', { introduced: true })],
      ['c', makeProgress('c', { introduced: true })],
      ['x', makeProgress('x', { introduced: true, state: 'relearning' })],
    ])

    render(<LearnTab />)

    fireEvent.click(screen.getByRole('button', { name: /lesson 3: lesson 3/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Lesson Anyway' }))

    await waitFor(() => {
      expect(screen.getByTestId('learn-session')).toHaveTextContent('Lesson 3::unlock')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Exit Session' }))
    fireEvent.click(screen.getByRole('button', { name: /lesson 3: lesson 3/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByTestId('learn-session')).not.toBeInTheDocument()
  })
})
