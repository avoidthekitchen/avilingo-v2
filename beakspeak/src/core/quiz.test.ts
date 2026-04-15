import { describe, it, expect } from 'vitest'
import { buildQuizSession, selectExerciseType, selectDistractors, selectClip } from './quiz'
import type { Species, UserProgress, Manifest, ConfuserPair } from './types'

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
        { xc_id: `${id}_s1`, xc_url: '', audio_url: '/a.ogg', type: 'song', quality: 'A', length: '0:10', recordist: 'test', license: 'CC', location: '', country: '', score: 10 },
        { xc_id: `${id}_s2`, xc_url: '', audio_url: '/b.ogg', type: 'song', quality: 'A', length: '0:10', recordist: 'test', license: 'CC', location: '', country: '', score: 9 },
      ],
      calls: [
        { xc_id: `${id}_c1`, xc_url: '', audio_url: '/c.ogg', type: 'call', quality: 'A', length: '0:05', recordist: 'test', license: 'CC', location: '', country: '', score: 8 },
      ],
    },
    photo: { url: '/test.jpg', filename: 'test.jpg', source: 'test', license: 'CC', wikipedia_page: '' },
  }
}

function makeProgress(speciesId: string, overrides: Partial<UserProgress> = {}): UserProgress {
  return {
    speciesId,
    introduced: true,
    stability: 1,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 1,
    reps: 0,
    lapses: 0,
    state: 'learning',
    nextReview: Date.now() - 1000, // due now
    ...overrides,
  }
}

describe('selectExerciseType', () => {
  it('returns three_choice for low reps', () => {
    expect(selectExerciseType(makeProgress('a', { reps: 0 }))).toBe('three_choice')
    expect(selectExerciseType(makeProgress('a', { reps: 2 }))).toBe('three_choice')
  })

  it('returns same_different for higher reps', () => {
    expect(selectExerciseType(makeProgress('a', { reps: 3 }))).toBe('same_different')
    expect(selectExerciseType(makeProgress('a', { reps: 5 }))).toBe('same_different')
  })
})

describe('selectDistractors', () => {
  const species = ['a', 'b', 'c', 'd', 'e'].map(makeSpecies)

  it('returns 2 distractors (for 3-choice)', () => {
    const result = selectDistractors(species[0], species, [])
    expect(result).toHaveLength(2)
    expect(result.every(d => d.id !== 'a')).toBe(true)
  })

  it('prefers confuser pair species', () => {
    const pairs: ConfuserPair[] = [
      { pair: ['a', 'b'], label: 'test', difficulty: 'easy', key_difference: 'test' },
    ]
    const result = selectDistractors(species[0], species, pairs)
    expect(result.some(d => d.id === 'b')).toBe(true)
  })
})

describe('selectClip', () => {
  const species = makeSpecies('a')

  it('returns a clip different from lastPlayedClipId', () => {
    const clip = selectClip(species, 'a_s1')
    expect(clip.xc_id).not.toBe('a_s1')
  })

  it('returns any clip when no last played', () => {
    const clip = selectClip(species, undefined)
    expect(clip).toBeDefined()
  })
})

describe('buildQuizSession', () => {
  it('builds a session of 8-10 items when enough due', () => {
    const speciesIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    const allSpecies = speciesIds.map(makeSpecies)
    const progress = new Map(speciesIds.map(id => [id, makeProgress(id)]))
    const manifest = {
      version: '0.1.0', tier: 1, region: 'Test', target_species_count: 10,
      curation_date: '2026-01-01', data_sources: {},
      species: allSpecies,
      confuser_pairs: [],
      lesson_plan: { description: 'test', lessons: [] },
    } as Manifest
    const session = buildQuizSession(progress, manifest, new Map())
    expect(session.length).toBeGreaterThanOrEqual(8)
    expect(session.length).toBeLessThanOrEqual(10)
  })
})
