import type { Lesson } from '../../core/types'

function formatSkippedLessonLabel(skippedLessons: Lesson[]): string {
  const lessonNumbers = skippedLessons.map(lesson => lesson.lesson)

  if (lessonNumbers.length === 1) {
    return `Lesson ${lessonNumbers[0]}`
  }

  if (lessonNumbers.length === 2) {
    return `Lessons ${lessonNumbers[0]} and ${lessonNumbers[1]}`
  }

  if (lessonNumbers.length === 3) {
    return `Lessons ${lessonNumbers[0]}, ${lessonNumbers[1]}, and ${lessonNumbers[2]}`
  }

  return `Lessons ${lessonNumbers[0]}-${lessonNumbers[lessonNumbers.length - 1]}`
}

export function getUnlockConsequenceCopy(skippedLessons: Lesson[], selectedLessonNum: number): string {
  if (skippedLessons.length === 0) {
    return `This will open Lesson ${selectedLessonNum} now. Nothing will be marked learned unless you finish the lesson.`
  }

  const birdCount = skippedLessons.reduce((count, lesson) => count + lesson.species.length, 0)
  const birdLabel = `${birdCount} ${birdCount === 1 ? 'bird' : 'birds'}`

  return `${formatSkippedLessonLabel(skippedLessons)} will be marked learned now, so those ${birdLabel} will start showing up in your reviews.`
}
