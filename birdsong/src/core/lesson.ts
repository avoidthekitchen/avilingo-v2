import type { Lesson, Species, UserProgress, IntroQuizItem } from './types'

export function isLessonAvailable(
  lessonNum: number,
  completedLessonNums: number[],
  allProgress: Map<string, UserProgress>,
): boolean {
  // Block if any bird is in relearning state
  for (const progress of allProgress.values()) {
    if (progress.state === 'relearning') return false
  }
  // Lesson 1 is always available
  if (lessonNum === 1) return true
  // Otherwise, previous lesson must be complete
  return completedLessonNums.includes(lessonNum - 1)
}

export function isLessonComplete(
  lesson: Lesson,
  allProgress: Map<string, UserProgress>,
): boolean {
  return lesson.species.every(id => {
    const progress = allProgress.get(id)
    return progress?.introduced === true
  })
}

export function getNextLesson(
  lessons: Lesson[],
  completedLessonNums: number[],
): Lesson | null {
  const completed = new Set(completedLessonNums)
  return lessons.find(l => !completed.has(l.lesson)) ?? null
}

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

export function buildIntroQuiz(
  lesson: Lesson,
  lessonSpecies: Species[],
  previouslyIntroduced: Species[],
  _allSpecies: Species[],
): IntroQuizItem[] {
  // Generate 3-5 questions testing the lesson species
  const targetCount = Math.min(5, Math.max(3, lessonSpecies.length + 2))

  // Build a pool of targets: each lesson species appears at least once, then extras are random repeats
  let targets = [...lessonSpecies]
  while (targets.length < targetCount) {
    targets.push(lessonSpecies[Math.floor(Math.random() * lessonSpecies.length)])
  }
  targets = shuffle(targets)

  return targets.map(target => {
    // Build 3-choice: target + 2 distractors
    const distractorPool = [
      ...lessonSpecies.filter(s => s.id !== target.id),
      ...previouslyIntroduced.filter(s => s.id !== target.id),
    ]
    const distractors = pickRandom(distractorPool, 2)
    const choices = shuffle([target, ...distractors])

    // Pick a random song clip for the question
    const allClips = [...target.audio_clips.songs, ...target.audio_clips.calls]
    const clip = allClips[Math.floor(Math.random() * allClips.length)] ?? target.audio_clips.songs[0]

    return { targetSpecies: target, clip, choices }
  })
}

export function buildReviewQuiz(
  introducedSpecies: Species[],
): IntroQuizItem[] {
  if (introducedSpecies.length < 3) return []

  const count = Math.min(3, Math.max(2, Math.floor(introducedSpecies.length / 2)))
  const targets = pickRandom(introducedSpecies, count)

  return targets.map(target => {
    const distractorPool = introducedSpecies.filter(s => s.id !== target.id)
    const distractors = pickRandom(distractorPool, 2)
    const choices = shuffle([target, ...distractors])

    const allClips = [...target.audio_clips.songs, ...target.audio_clips.calls]
    const clip = allClips[Math.floor(Math.random() * allClips.length)] ?? target.audio_clips.songs[0]

    return { targetSpecies: target, clip, choices }
  })
}
