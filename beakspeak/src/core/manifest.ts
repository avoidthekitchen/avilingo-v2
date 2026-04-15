import type { Manifest, Species, ConfuserPair, Lesson } from './types'

function prefixUrl(url: string): string {
  if (url.startsWith('/')) {
    return import.meta.env.BASE_URL + url.slice(1)
  }
  return url
}

export async function loadManifest(): Promise<Manifest> {
  const response = await fetch(import.meta.env.BASE_URL + 'content/manifest.json')
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.status}`)
  }
  const manifest: Manifest = await response.json()

  // Prefix content URLs so they resolve correctly when served from a subpath
  for (const species of manifest.species) {
    species.photo.url = prefixUrl(species.photo.url)
    for (const clip of species.audio_clips.songs) clip.audio_url = prefixUrl(clip.audio_url)
    for (const clip of species.audio_clips.calls) clip.audio_url = prefixUrl(clip.audio_url)
  }

  return manifest
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
