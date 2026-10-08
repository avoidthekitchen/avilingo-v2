import type { ConfusionEvent, UserProgress } from '../core/types'

export const databaseName = 'beakspeak'
export const schemaVersion = 1

// Append future versions; never replace a released migration or rebuild user data.
export const migrations = [{
  version: 1,
  statements: `
    CREATE TABLE progress (
      speciesId TEXT PRIMARY KEY NOT NULL,
      introduced INTEGER NOT NULL CHECK (introduced IN (0, 1)),
      introducedAt INTEGER,
      stability REAL NOT NULL,
      difficulty REAL NOT NULL,
      elapsedDays REAL NOT NULL,
      scheduledDays REAL NOT NULL,
      reps INTEGER NOT NULL,
      lapses INTEGER NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('new', 'learning', 'review', 'relearning')),
      lastReview INTEGER,
      nextReview INTEGER
    );
    CREATE TABLE confusions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      targetId TEXT NOT NULL,
      chosenId TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX confusions_timestamp ON confusions(timestamp);
    PRAGMA user_version = 1;
  `,
}]

export const saveProgressStatement = `
  INSERT INTO progress (speciesId, introduced, introducedAt, stability, difficulty,
    elapsedDays, scheduledDays, reps, lapses, state, lastReview, nextReview)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(speciesId) DO UPDATE SET
    introduced = excluded.introduced, introducedAt = excluded.introducedAt,
    stability = excluded.stability, difficulty = excluded.difficulty,
    elapsedDays = excluded.elapsedDays, scheduledDays = excluded.scheduledDays,
    reps = excluded.reps, lapses = excluded.lapses, state = excluded.state,
    lastReview = excluded.lastReview, nextReview = excluded.nextReview
`

export const statements = {
  getProgress: 'SELECT * FROM progress WHERE speciesId = ?',
  getAllProgress: 'SELECT * FROM progress ORDER BY speciesId',
  getConfusionLog: 'SELECT * FROM confusions ORDER BY id',
  logConfusion: 'INSERT INTO confusions (targetId, chosenId, timestamp) VALUES (?, ?, ?)',
  clearProgress: 'DELETE FROM progress',
  clearConfusions: 'DELETE FROM confusions',
}

export function progressValues(progress: UserProgress) {
  return [progress.speciesId, Number(progress.introduced), progress.introducedAt ?? null,
    progress.stability, progress.difficulty, progress.elapsedDays, progress.scheduledDays,
    progress.reps, progress.lapses, progress.state, progress.lastReview ?? null,
    progress.nextReview ?? null]
}

export function readProgress(row: Record<string, unknown>): UserProgress {
  const introduced = row.introduced
  const state = row.state
  if ((introduced !== 0 && introduced !== 1) ||
    (state !== 'new' && state !== 'learning' && state !== 'review' && state !== 'relearning')) {
    throw new Error('Invalid saved progress')
  }
  return {
    speciesId: readString(row.speciesId), introduced: introduced === 1,
    stability: readNumber(row.stability), difficulty: readNumber(row.difficulty),
    elapsedDays: readNumber(row.elapsedDays), scheduledDays: readNumber(row.scheduledDays),
    reps: readNumber(row.reps), lapses: readNumber(row.lapses), state,
    ...(row.introducedAt == null ? {} : { introducedAt: readNumber(row.introducedAt) }),
    ...(row.lastReview == null ? {} : { lastReview: readNumber(row.lastReview) }),
    ...(row.nextReview == null ? {} : { nextReview: readNumber(row.nextReview) }),
  }
}

export function readConfusion(row: Record<string, unknown>): ConfusionEvent {
  return {
    targetId: readString(row.targetId), chosenId: readString(row.chosenId), timestamp: readNumber(row.timestamp),
  }
}

export function confusionValues(event: ConfusionEvent) {
  return [event.targetId, event.chosenId, event.timestamp]
}

export function readString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid saved storage record')
  return value
}

export function readNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid saved storage record')
  return value
}

export function readRows(values: unknown): Record<string, unknown>[] {
  if (!Array.isArray(values) || values.some(row => row == null || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('Invalid database response')
  }
  return values
}
