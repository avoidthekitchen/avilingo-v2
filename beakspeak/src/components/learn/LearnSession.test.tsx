import type { HTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import LearnSession from './LearnSession'
import type { Lesson, Manifest, Species } from '../../core/types'

let mockState: Record<string, unknown>

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockState),
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      dragConstraints?: unknown
      dragElastic?: unknown
      initial?: unknown
      animate?: unknown
      exit?: unknown
      transition?: unknown
      whileDrag?: unknown
      onDragEnd?: unknown
    }) => {
      const divProps = { ...props }
      delete divProps.dragConstraints
      delete divProps.dragElastic
      delete divProps.initial
      delete divProps.animate
      delete divProps.exit
      delete divProps.transition
      delete divProps.whileDrag
      delete divProps.onDragEnd

      return <div {...divProps}>{children}</div>
    },
  },
}))

vi.mock('./BirdCard', () => ({
  default: ({ species }: { species: Species }) => <div>Bird Card: {species.common_name}</div>,
}))

vi.mock('./IntroQuiz', () => ({
  default: ({
    onBack,
    onComplete,
  }: {
    onBack?: () => void
    onComplete: (results: Array<{ correct: boolean }>) => void
  }) => (
    <div>
      <p>Intro Quiz</p>
      {onBack ? <button onClick={onBack}>Back</button> : null}
      <button onClick={() => onComplete([])}>Finish Quiz</button>
    </div>
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

describe('LearnSession unlock mode', () => {
  beforeEach(() => {
    mockState = {
      manifest: makeManifest(),
      getIntroducedSpecies: () => ['a', 'b', 'c'].map(id => makeSpecies(id)),
      introduceSpecies: vi.fn(async () => {}),
    }
  })

  it('skips the review warm-up in unlock mode', () => {
    render(<LearnSession lesson={makeLesson(2, ['d', 'e', 'f'])} mode="unlock" onComplete={() => {}} />)

    expect(screen.queryByText('Quick Review')).not.toBeInTheDocument()
    expect(screen.getByText('Bird Card: D')).toBeInTheDocument()
  })

  it('introduces the selected lesson species when an unlock session is completed', async () => {
    render(<LearnSession lesson={makeLesson(2, ['d', 'e', 'f'])} mode="unlock" onComplete={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /start quiz/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish Quiz' }))

    await waitFor(() => {
      expect(mockState.introduceSpecies).toHaveBeenCalledWith(['d', 'e', 'f'])
    })

    expect(screen.getByText('Lesson Complete!')).toBeInTheDocument()
  })
})

describe('LearnSession redo mode', () => {
  beforeEach(() => {
    mockState = {
      manifest: makeManifest(),
      getIntroducedSpecies: () => ['a', 'b', 'c'].map(id => makeSpecies(id)),
      introduceSpecies: vi.fn(async () => {}),
    }
  })

  it('starts on lesson cards instead of warm-up review', () => {
    render(<LearnSession lesson={makeLesson(2, ['d', 'e', 'f'])} mode="redo" onComplete={() => {}} />)

    expect(screen.queryByText('Quick Review')).not.toBeInTheDocument()
    expect(screen.getByText('Bird Card: D')).toBeInTheDocument()
  })

  it('completes redo sessions without introducing species and explains that the schedule stayed unchanged', async () => {
    render(<LearnSession lesson={makeLesson(2, ['d', 'e', 'f'])} mode="redo" onComplete={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /start quiz/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish Quiz' }))

    await waitFor(() => {
      expect(mockState.introduceSpecies).not.toHaveBeenCalled()
    })

    expect(await screen.findByRole('heading', { name: 'Refresher Complete!' })).toBeInTheDocument()
    expect(screen.getByText('This refresher did not change your review schedule.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to Lessons' })).toBeInTheDocument()
  })

  it('routes quiz Back to lesson exit', () => {
    const onComplete = vi.fn()

    render(<LearnSession lesson={makeLesson(2, ['d', 'e', 'f'])} mode="redo" onComplete={onComplete} />)

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /start quiz/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
