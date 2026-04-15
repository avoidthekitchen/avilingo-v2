import type { Manifest, Species, ConfuserPair, Lesson } from './types'

export async function loadManifest(): Promise<Manifest> {
  const response = await fetch('/content/manifest.json')
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.status}`)
  }
  return response.json()
}

export function getSpeciesById(manifest: Manifest, id: string): Species | undefined {
  return manifest.species.find(s => s.id === id)
}

export function getSpeciesByIds(manifest: Manifest, ids: string[]): Species[] {
  return ids
    .map(id => getSpeciesById(manifest, id))
    .filter((s): s is Species => s !== undefined)
}

export function getInTierConfuserPairs(manifest: Manifest): ConfuserPair[] {
  const speciesIds = new Set(manifest.species.map(s => s.id))
  return manifest.confuser_pairs.filter(
    pair => speciesIds.has(pair.pair[0]) && speciesIds.has(pair.pair[1])
  )
}

export function getLessons(manifest: Manifest): Lesson[] {
  return manifest.lesson_plan.lessons
}
