import { fsrs, createEmptyCard, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { UserProgress } from './types';

const scheduler = fsrs({
  request_retention: 0.85,
  maximum_interval: 180,
  w: [
    0.3, 0.6, 1.8, 4.5,
    5.0, 1.0, 0.75, 0.0, 1.5, 0.1,
    1.0, 2.0, 0.05, 0.3, 1.4, 0.2, 2.8,
  ],
  enable_fuzz: false,
  enable_short_term: false,
  learning_steps: [],
  relearning_steps: [],
});

function stateToString(state: State): UserProgress['state'] {
  switch (state) {
    case State.New: return 'new';
    case State.Learning: return 'learning';
    case State.Review: return 'review';
    case State.Relearning: return 'relearning';
  }
}

export function createNewProgress(speciesId: string): UserProgress {
  const card = createEmptyCard();
  return {
    speciesId,
    introduced: false,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: 'new',
  };
}

function progressToCard(progress: UserProgress): Card {
  let state: State;
  switch (progress.state) {
    case 'new': state = State.New; break;
    case 'learning': state = State.Learning; break;
    case 'review': state = State.Review; break;
    case 'relearning': state = State.Relearning; break;
  }
  return {
    due: progress.nextReview ? new Date(progress.nextReview) : new Date(),
    stability: progress.stability,
    difficulty: progress.difficulty,
    elapsed_days: progress.elapsedDays,
    scheduled_days: progress.scheduledDays,
    learning_steps: 0,
    reps: progress.reps,
    lapses: progress.lapses,
    state,
    last_review: progress.lastReview ? new Date(progress.lastReview) : undefined,
  };
}

function cardToProgress(card: Card, speciesId: string, introduced: boolean): UserProgress {
  return {
    speciesId,
    introduced,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: stateToString(card.state),
    lastReview: card.last_review ? card.last_review.getTime() : undefined,
    nextReview: card.due.getTime(),
  };
}

export function scheduleReview(progress: UserProgress, rating: Grade): UserProgress {
  const card = progressToCard(progress);
  const now = new Date();
  const result = scheduler.next(card, now, rating);
  return cardToProgress(result.card, progress.speciesId, progress.introduced);
}

export function isDue(progress: UserProgress): boolean {
  if (!progress.introduced) return false;
  if (!progress.nextReview) return true;
  return Date.now() >= progress.nextReview;
}

export function ratingFromOutcome(correct: boolean, responseTimeMs: number): Grade {
  if (!correct) return Rating.Again;
  if (responseTimeMs < 2500) return Rating.Easy;
  if (responseTimeMs < 7000) return Rating.Good;
  return Rating.Hard;
}

export function ratingFromOutcomeSameDifferent(correct: boolean, responseTimeMs: number): Grade {
  if (!correct) return Rating.Again;
  if (responseTimeMs < 4000) return Rating.Easy;
  if (responseTimeMs < 10000) return Rating.Good;
  return Rating.Hard;
}

export function getNextReviewDate(progress: UserProgress): Date | null {
  if (!progress.nextReview) return null;
  return new Date(progress.nextReview);
}
