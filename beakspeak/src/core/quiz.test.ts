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

  it('never returns duplicate choices in three-choice items', () => {
    const speciesIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const allSpecies = speciesIds.map(makeSpecies)
    const progress = new Map(speciesIds.map(id => [id, makeProgress(id)]))
    const manifest = {
      version: '0.1.0', tier: 1, region: 'Test', target_species_count: 8,
      curation_date: '2026-01-01', data_sources: {},
      species: allSpecies,
      confuser_pairs: [],
      lesson_plan: { description: 'test', lessons: [] },
    } as Manifest

    const session = buildQuizSession(progress, manifest, new Map())

    session
      .filter(item => item.exerciseType === 'three_choice' && item.choices)
      .forEach(item => {
        expect(new Set(item.choices!.map(choice => choice.id)).size).toBe(item.choices!.length)
      })
  })
})

describe('same/different questions', () => {
  function makeManifest(species: Species[]): Manifest {
    return {
      version: '0.1.0', tier: 1, region: 'Test', target_species_count: species.length,
      curation_date: '2026-01-01', data_sources: {},
      species,
      confuser_pairs: [],
      lesson_plan: { description: 'test', lessons: [] },
    } as Manifest
  }

  it('contrasts a song with a call even when the song is labelled "call"', () => {
    // Crows and jays do not sing, so their curated "song" clips carry a "call" label.
    const crow = makeSpecies('amcr')
    crow.audio_clips.songs = [{ ...crow.audio_clips.songs[0], type: 'call' }]
    const progress = new Map([['amcr', makeProgress('amcr', { reps: 3 })]])

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const [item] = buildQuizSession(progress, makeManifest([crow]), new Map())
      expect(item.exerciseType).toBe('same_different')
      expect(item.secondClip).toBeDefined()
      expect(item.secondClip!.xc_id).not.toBe(item.clip.xc_id)
    }
  })

  it('never plays the identical clip twice while an alternative exists', () => {
    const species = ['a', 'b', 'c'].map(makeSpecies)
    const progress = new Map(species.map(s => [s.id, makeProgress(s.id, { reps: 4 })]))

    for (let attempt = 0; attempt < 30; attempt += 1) {
      for (const item of buildQuizSession(progress, makeManifest(species), new Map())) {
        if (item.exerciseType !== 'same_different') continue
        expect(item.secondClip!.xc_id).not.toBe(item.clip.xc_id)
        if (item.isSame) {
          const inCalls = (clip: { xc_id: string }) =>
            item.targetSpecies.audio_clips.calls.some(c => c.xc_id === clip.xc_id)
          expect(inCalls(item.clip)).not.toBe(inCalls(item.secondClip!))
        }
      }
    }
  })
})
