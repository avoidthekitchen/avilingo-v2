import type { Manifest, Species, ConfuserPair, Lesson } from './types'

export function resolveAssetUrl(url: string, baseUrl = import.meta.env.BASE_URL): string {
  if (url.startsWith('/')) {
    return baseUrl + url.slice(1)
  }
  return url
}

export async function loadManifest(): Promise<Manifest> {
  const response = await fetch(import.meta.env.BASE_URL + 'content/manifest.json')
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.status}`)
  }
  return resolveManifestAssets(await response.json())
}

export function resolveSrcset(srcset: string, baseUrl = import.meta.env.BASE_URL): string {
  return srcset
    .split(',')
    .map(candidate => {
      const [url, ...descriptors] = candidate.trim().split(/\s+/)
      return [resolveAssetUrl(url, baseUrl), ...descriptors].join(' ')
    })
    .join(', ')
}

// Prefix content URLs so they resolve correctly when served from a subpath
export function resolveManifestAssets(manifest: Manifest, baseUrl = import.meta.env.BASE_URL): Manifest {
  for (const species of manifest.species) {
    species.photo.url = resolveAssetUrl(species.photo.url, baseUrl)
    if (species.photo.srcset) species.photo.srcset = resolveSrcset(species.photo.srcset, baseUrl)
    for (const clip of species.audio_clips.songs) clip.audio_url = resolveAssetUrl(clip.audio_url, baseUrl)
    for (const clip of species.audio_clips.calls) clip.audio_url = resolveAssetUrl(clip.audio_url, baseUrl)
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
