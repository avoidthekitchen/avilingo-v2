import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs'
import type { UserProgress, ExerciseType } from './types'

const params = generatorParameters({
  request_retention: 0.85,
  maximum_interval: 180,
  w: [
    0.3, 0.6, 1.8, 4.5,
    5.0, 1.0, 0.75, 0.0, 1.5, 0.1, 1.0, 2.0, 0.05, 0.3, 1.4, 0.2, 2.8,
  ],
})

const scheduler = fsrs(params)

function progressToCard(progress: UserProgress): Card {
  const card = createEmptyCard()
  return {
    ...card,
    stability: progress.stability,
    difficulty: progress.difficulty,
    elapsed_days: progress.elapsedDays,
    scheduled_days: progress.scheduledDays,
    reps: progress.reps,
    lapses: progress.lapses,
    state: progress.state === 'new' ? 0 : progress.state === 'learning' ? 1 : progress.state === 'review' ? 2 : 3,
    last_review: progress.lastReview ? new Date(progress.lastReview) : undefined,
  }
}

function cardToProgressUpdate(card: Card): Partial<UserProgress> {
  const stateMap = ['new', 'learning', 'review', 'relearning'] as const
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: stateMap[card.state] ?? 'new',
    lastReview: card.last_review ? new Date(card.last_review).getTime() : undefined,
  }
}

export function createNewProgress(speciesId: string): UserProgress {
  return {
    speciesId,
    introduced: false,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
  }
}

export function scheduleReview(progress: UserProgress, rating: Grade): UserProgress {
  const card = progressToCard(progress)
  const now = new Date()
  const result = scheduler.repeat(card, now)
  const scheduled = result[rating]
  const updatedCard = scheduled.card
  const nextReview = scheduled.card.due ? new Date(scheduled.card.due).getTime() : undefined

  return {
    ...progress,
    ...cardToProgressUpdate(updatedCard),
    nextReview,
  }
}

export function isDue(progress: UserProgress): boolean {
  if (!progress.introduced) return false
  if (!progress.nextReview) return progress.state === 'new' && progress.introduced
  return progress.nextReview <= Date.now()
}

// Timing thresholds per exercise type (ms)
const THRESHOLDS = {
  three_choice: { fast: 2500, slow: 7000 },
  same_different: { fast: 4000, slow: 10000 },
} as const

export function ratingFromOutcome(
  correct: boolean,
  responseTimeMs: number,
  exerciseType: ExerciseType,
): Grade {
  if (!correct) return Rating.Again

  const { fast, slow } = THRESHOLDS[exerciseType]

  if (responseTimeMs < fast) return Rating.Easy
  if (responseTimeMs > slow) return Rating.Hard
  return Rating.Good
}

export { Rating }
