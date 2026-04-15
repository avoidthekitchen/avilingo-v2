import type { Species, UserProgress, Manifest, ConfuserPair, AudioClip, QuizItem, ExerciseType } from './types'
import { isDue } from './fsrs'

function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function pickRandom<T>(array: T[], count: number): T[] {
  return shuffle(array).slice(0, count)
}

export function selectExerciseType(progress: UserProgress): ExerciseType {
  // Low reps: three_choice. Higher reps: same_different.
  if (progress.reps < 3) return 'three_choice'
  return 'same_different'
}

export function selectDistractors(
  target: Species,
  introduced: Species[],
  confuserPairs: ConfuserPair[],
): Species[] {
  const distractorCount = 2 // 3-choice = 1 correct + 2 distractors

  // Find confuser pair partners
  const confuserIds = new Set<string>()
  for (const pair of confuserPairs) {
    if (pair.pair.includes(target.id)) {
      for (const id of pair.pair) {
        if (id !== target.id) confuserIds.add(id)
      }
    }
  }

  const pool = introduced.filter(s => s.id !== target.id)
  const confuserPool = pool.filter(s => confuserIds.has(s.id))
  const otherPool = pool.filter(s => !confuserIds.has(s.id))

  // Prefer confusers, then fill with others
  const distractors: Species[] = []
  for (const s of shuffle(confuserPool)) {
    if (distractors.length >= distractorCount) break
    distractors.push(s)
  }
  for (const s of shuffle(otherPool)) {
    if (distractors.length >= distractorCount) break
    distractors.push(s)
  }

  return distractors
}

export function selectClip(
  species: Species,
  lastPlayedClipId: string | undefined,
): AudioClip {
  const allClips = [...species.audio_clips.songs, ...species.audio_clips.calls]
  if (allClips.length === 0) throw new Error(`No clips for ${species.id}`)

  if (!lastPlayedClipId || allClips.length === 1) {
    return allClips[Math.floor(Math.random() * allClips.length)]
  }

  // Never same clip twice in a row
  const filtered = allClips.filter(c => c.xc_id !== lastPlayedClipId)
  return filtered[Math.floor(Math.random() * filtered.length)] ?? allClips[0]
}

function buildSameDifferentItem(
  target: Species,
  introduced: Species[],
  confuserPairs: ConfuserPair[],
  lastPlayedClipId: Map<string, string>,
): QuizItem {
  const isSame = Math.random() < 0.5

  const clip1 = selectClip(target, lastPlayedClipId.get(target.id))

  if (isSame) {
    // Same species: mix types (song + call) when possible
    const songClips = target.audio_clips.songs
    const callClips = target.audio_clips.calls
    let clip2: AudioClip

    if (clip1.type.includes('call') && songClips.length > 0) {
      clip2 = songClips[Math.floor(Math.random() * songClips.length)]
    } else if (callClips.length > 0) {
      clip2 = callClips[Math.floor(Math.random() * callClips.length)]
    } else {
      // Fall back to different clip of same type
      const others = [...songClips, ...callClips].filter(c => c.xc_id !== clip1.xc_id)
      clip2 = others[Math.floor(Math.random() * others.length)] ?? clip1
    }

    return {
      targetSpecies: target,
      exerciseType: 'same_different',
      clip: clip1,
      secondClip: clip2,
      secondSpecies: target,
      isSame: true,
    }
  } else {
    // Different species: prefer confuser pair partner
    const confuserIds = new Set<string>()
    for (const pair of confuserPairs) {
      if (pair.pair.includes(target.id)) {
        for (const id of pair.pair) {
          if (id !== target.id) confuserIds.add(id)
        }
      }
    }

    const pool = introduced.filter(s => s.id !== target.id)
    const confuserPool = pool.filter(s => confuserIds.has(s.id))
    const second = confuserPool.length > 0
      ? confuserPool[Math.floor(Math.random() * confuserPool.length)]
      : pool[Math.floor(Math.random() * pool.length)]

    if (!second) {
      // Fallback: make it a same question if no other species
      return buildSameDifferentItem(target, introduced, confuserPairs, lastPlayedClipId)
    }

    const clip2 = selectClip(second, lastPlayedClipId.get(second.id))

    return {
      targetSpecies: target,
      exerciseType: 'same_different',
      clip: clip1,
      secondClip: clip2,
      secondSpecies: second,
      isSame: false,
    }
  }
}

export function buildQuizSession(
  allProgress: Map<string, UserProgress>,
  manifest: Manifest,
  lastPlayedClipId: Map<string, string>,
): QuizItem[] {
  const speciesMap = new Map(manifest.species.map(s => [s.id, s]))
  const confuserPairs = manifest.confuser_pairs
  const introduced = manifest.species.filter(s => allProgress.get(s.id)?.introduced)

  // Gather due reviews
  const dueProgress = Array.from(allProgress.values())
    .filter(p => isDue(p))
    .sort((a, b) => {
      // Sort by overdue-ness (most overdue first)
      const aOverdue = a.nextReview ? Date.now() - a.nextReview : Infinity
      const bOverdue = b.nextReview ? Date.now() - b.nextReview : Infinity
      return bOverdue - aOverdue
    })

  const targetSize = Math.min(10, Math.max(8, dueProgress.length))
  const items: QuizItem[] = []

  // Add due reviews
  for (const progress of dueProgress) {
    if (items.length >= targetSize) break
    const species = speciesMap.get(progress.speciesId)
    if (!species) continue

    const exerciseType = selectExerciseType(progress)

    if (exerciseType === 'three_choice') {
      const distractors = selectDistractors(species, introduced, confuserPairs)
      const clip = selectClip(species, lastPlayedClipId.get(species.id))
      items.push({
        targetSpecies: species,
        exerciseType: 'three_choice',
        clip,
        choices: shuffle([species, ...distractors]),
      })
    } else {
      items.push(buildSameDifferentItem(species, introduced, confuserPairs, lastPlayedClipId))
    }
  }

  // Pad with re-tests of recently introduced birds if under minimum
  if (items.length < 8) {
    const recentlyIntroduced = introduced
      .filter(s => !items.some(item => item.targetSpecies.id === s.id))
    for (const species of shuffle(recentlyIntroduced)) {
      if (items.length >= 8) break
      const distractors = selectDistractors(species, introduced, confuserPairs)
      const clip = selectClip(species, lastPlayedClipId.get(species.id))
      items.push({
        targetSpecies: species,
        exerciseType: 'three_choice',
        clip,
        choices: shuffle([species, ...distractors]),
      })
    }
  }

  return shuffle(items)
}
