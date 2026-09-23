const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Learner-facing copy for when a bird is next due. FSRS schedules early reviews
 * minutes or hours out, so a bare calendar date ("Next: 9/18/2026" for a bird due
 * in ten minutes) read as wrong. Anything more than a week away shows the date.
 */
export function formatNextReview(nextReview: number, now = Date.now()): string {
  const delta = nextReview - now
  if (delta <= 0) return 'Due now'
  // Each band is chosen by the rounded value and clamped to it, so a delta is never
  // reported in a unit it has not reached: 59 min 40 s rounds to 60 minutes and is
  // handed to the hour band as "Due in 1 h", and 23 h 30 m rounds to 24 hours but
  // reads "Due in 23 h". The clamp also keeps sub-day deltas out of the day
  // arithmetic below, which assumes a full day and would answer "Due in 0 days"
  // for a review later the same day when now is midnight.
  const minutes = Math.round(delta / MINUTE)
  if (minutes < 60) return `Due in ${Math.max(1, minutes)} min`
  if (delta < DAY) return `Due in ${Math.min(23, Math.round(delta / HOUR))} h`

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const dayOffset = Math.floor((nextReview - startOfToday.getTime()) / DAY)
  if (dayOffset === 1) return 'Due tomorrow'
  if (dayOffset <= 7) return `Due in ${dayOffset} days`
  return `Next: ${new Date(nextReview).toLocaleDateString()}`
}
