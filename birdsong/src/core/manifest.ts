import type { Manifest, Species, ConfuserPair, Lesson } from './types';

export async function loadManifest(): Promise<Manifest> {
  const resp = await fetch('/content/manifest.json');
  if (!resp.ok) throw new Error(`Failed to load manifest: ${resp.status}`);
  return resp.json();
}

export function getSpeciesById(manifest: Manifest, id: string): Species | undefined {
  return manifest.species.find((s) => s.id === id);
}

export function getSpeciesByIds(manifest: Manifest, ids: string[]): Species[] {
  return ids
    .map((id) => manifest.species.find((s) => s.id === id))
    .filter((s): s is Species => s !== undefined);
}

export function getInTierConfuserPairs(manifest: Manifest): ConfuserPair[] {
  const tierIds = new Set(manifest.species.map((s) => s.id));
  return manifest.confuser_pairs.filter(
    (p) => tierIds.has(p.pair[0]) && tierIds.has(p.pair[1])
  );
}

export function getLessons(manifest: Manifest): Lesson[] {
  return manifest.lesson_plan.lessons;
}

export function getAllClips(species: Species): import('./types').AudioClip[] {
  return [...species.audio_clips.songs, ...species.audio_clips.calls];
}

export function getRecordistAttribution(clip: import('./types').AudioClip): string {
  return `Recording by ${clip.recordist}, Xeno-canto ${clip.xc_id}`;
}
