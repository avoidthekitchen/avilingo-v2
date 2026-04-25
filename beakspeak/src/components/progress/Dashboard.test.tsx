import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Dashboard from './Dashboard'
import type { AudioClip, Manifest, Species, UserProgress } from '../../core/types'

const { audioButtonMock } = vi.hoisted(() => ({
  audioButtonMock: vi.fn(({ label }: { label: string }) => <button type="button">{label}</button>),
}))

let mockState: Record<string, unknown>

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockState),
}))

vi.mock('../shared/AudioButton', () => ({
  default: (props: { clips: AudioClip[]; label: string; speciesId: string; variant?: 'primary' | 'secondary' }) =>
    audioButtonMock(props),
}))

function makeClip(id: string, type: 'song' | 'call'): AudioClip {
  return {
    xc_id: id,
    xc_url: `https://xeno-canto.org/${id}`,
    audio_url: `/content/${id}.ogg`,
    type,
    quality: 'A',
    length: '0:10',
    recordist: 'Tester',
    license: 'CC',
    location: 'Test',
    country: 'US',
    score: 10,
  }
}

function makeSpecies(overrides: Partial<Species> & Pick<Species, 'id' | 'common_name'>): Species {
  return {
    id: overrides.id,
    common_name: overrides.common_name,
    scientific_name: `${overrides.common_name} scientificus`,
    family: 'Testidae',
    ebird_frequency_pct: 42,
    habitat: ['forest'],
    seasonality: 'year-round',
    mnemonic: 'test mnemonic',
    sound_types: { song: 'warble', call: 'chip' },
    confuser_species: [],
    confuser_notes: '',
    audio_clips: {
      songs: [],
      calls: [],
      ...overrides.audio_clips,
    },
    photo: {
      url: `/${overrides.id}.jpg`,
      filename: `${overrides.id}.jpg`,
      source: 'test',
      license: 'CC',
      wikipedia_page: '',
    },
    wikipedia_audio: [],
  }
}

function makeManifest(species: Species[]): Manifest {
  return {
    version: '1',
    tier: 1,
    region: 'test',
    target_species_count: species.length,
    curation_date: '2026-04-23',
    data_sources: {},
    species,
    confuser_pairs: [],
    lesson_plan: {
      description: 'test',
      lessons: [],
    },
  }
}

function makeProgress(speciesId: string, overrides: Partial<UserProgress> = {}): UserProgress {
  return {
    speciesId,
    introduced: true,
    introducedAt: Date.now(),
    stability: 1,
    difficulty: 1,
    elapsedDays: 0,
    scheduledDays: 1,
    reps: 2,
    lapses: 0,
    state: 'review',
    nextReview: Date.now() + 86400000,
    ...overrides,
  }
}

describe('Dashboard audio shortcuts', () => {
  beforeEach(() => {
    audioButtonMock.mockClear()

    const speciesWithBoth = makeSpecies({
      id: 'amro',
      common_name: 'American Robin',
      audio_clips: {
        songs: [makeClip('song-1', 'song'), makeClip('song-2', 'song')],
        calls: [makeClip('call-1', 'call'), makeClip('call-2', 'call')],
      },
    })
    const speciesWithSongOnly = makeSpecies({
      id: 'coye',
      common_name: 'Common Yellowthroat',
      audio_clips: {
        songs: [makeClip('song-3', 'song')],
        calls: [],
      },
    })
    const speciesWithNone = makeSpecies({
      id: 'noro',
      common_name: 'Northern Rough-winged Swallow',
    })
    const manifest = makeManifest([speciesWithBoth, speciesWithSongOnly, speciesWithNone])

    mockState = {
      manifest,
      allProgress: new Map<string, UserProgress>([
        ['amro', makeProgress('amro')],
        ['coye', makeProgress('coye', { state: 'learning' })],
      ]),
      getIntroducedSpecies: () => [speciesWithBoth, speciesWithSongOnly],
      getDueForReview: () => [makeProgress('amro')],
      setTab: vi.fn(),
      resetProgress: vi.fn(),
    }
  })

  it('renders first-song and first-call controls for each species row when available', () => {
    render(<Dashboard />)

    expect(screen.getAllByRole('button', { name: 'Song' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Call' })).toHaveLength(1)

    expect(audioButtonMock).toHaveBeenNthCalledWith(1,
      expect.objectContaining({
        clips: [expect.objectContaining({ xc_id: 'song-1' })],
        label: 'Song',
        speciesId: 'amro',
        variant: 'primary',
      }),
    )
    expect(audioButtonMock).toHaveBeenNthCalledWith(2,
      expect.objectContaining({
        clips: [expect.objectContaining({ xc_id: 'call-1' })],
        label: 'Call',
        speciesId: 'amro',
        variant: 'primary',
      }),
    )
    expect(audioButtonMock).toHaveBeenNthCalledWith(3,
      expect.objectContaining({
        clips: [expect.objectContaining({ xc_id: 'song-3' })],
        label: 'Song',
        speciesId: 'coye',
        variant: 'primary',
      }),
    )
  })

  it('does not render audio controls when a species has no song or call clips', () => {
    render(<Dashboard />)

    expect(audioButtonMock).toHaveBeenCalledTimes(3)
    expect(screen.getByText('Northern Rough-winged Swallow')).toBeInTheDocument()
  })
})
