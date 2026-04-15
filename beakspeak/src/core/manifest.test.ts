import { describe, it, expect } from 'vitest'
import { getSpeciesById, getSpeciesByIds, getInTierConfuserPairs, getLessons } from './manifest'
import type { Manifest, Species, ConfuserPair } from './types'

function makeSpecies(id: string): Species {
  return {
    id,
    common_name: id.toUpperCase(),
    scientific_name: `Genus ${id}`,
    family: 'TestFamily',
    ebird_frequency_pct: 50,
    habitat: ['backyard'],
    seasonality: 'year-round',
    mnemonic: 'test mnemonic',
    sound_types: { song: 'test song', call: 'test call' },
    confuser_species: [],
    confuser_notes: '',
    audio_clips: { songs: [], calls: [] },
    photo: { url: '/test.jpg', filename: 'test.jpg', source: 'test', license: 'CC', wikipedia_page: '' },
  }
}

function makeManifest(speciesIds: string[], confuserPairs: ConfuserPair[] = []): Manifest {
  return {
    version: '0.1.0',
    tier: 1,
    region: 'Test',
    target_species_count: speciesIds.length,
    curation_date: '2026-01-01',
    data_sources: {},
    species: speciesIds.map(makeSpecies),
    confuser_pairs: confuserPairs,
    lesson_plan: {
      description: 'test',
      lessons: [
        { lesson: 1, title: 'Lesson 1', species: speciesIds.slice(0, 3), rationale: 'test' },
      ],
    },
  }
}

describe('getSpeciesById', () => {
  it('returns the species with matching id', () => {
    const manifest = makeManifest(['amro', 'amcr', 'sosp'])
    const result = getSpeciesById(manifest, 'amcr')
    expect(result?.id).toBe('amcr')
  })

  it('returns undefined for unknown id', () => {
    const manifest = makeManifest(['amro'])
    expect(getSpeciesById(manifest, 'zzz')).toBeUndefined()
  })
})

describe('getSpeciesByIds', () => {
  it('returns species matching the given ids in order', () => {
    const manifest = makeManifest(['amro', 'amcr', 'sosp'])
    const result = getSpeciesByIds(manifest, ['sosp', 'amro'])
    expect(result.map(s => s.id)).toEqual(['sosp', 'amro'])
  })

  it('skips unknown ids', () => {
    const manifest = makeManifest(['amro'])
    const result = getSpeciesByIds(manifest, ['amro', 'zzz'])
    expect(result).toHaveLength(1)
  })
})

describe('getInTierConfuserPairs', () => {
  it('returns only pairs where both species are in the manifest', () => {
    const pairs: ConfuserPair[] = [
      { pair: ['bcch', 'cbch'], label: 'Chickadees', difficulty: 'medium', key_difference: 'test' },
      { pair: ['bcch', 'outoftier'], label: 'Bad pair', difficulty: 'easy', key_difference: 'test' },
    ]
    const manifest = makeManifest(['bcch', 'cbch', 'amro'], pairs)
    const result = getInTierConfuserPairs(manifest)
    expect(result).toHaveLength(1)
    expect(result[0].pair).toEqual(['bcch', 'cbch'])
  })
})

describe('getLessons', () => {
  it('returns lessons from the lesson plan', () => {
    const manifest = makeManifest(['amro', 'amcr', 'sosp'])
    const lessons = getLessons(manifest)
    expect(lessons).toHaveLength(1)
    expect(lessons[0].lesson).toBe(1)
  })
})
