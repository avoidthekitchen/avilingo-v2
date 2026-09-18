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
  if (delta < HOUR) return `Due in ${Math.max(1, Math.round(delta / MINUTE))} min`
  if (delta < DAY) return `Due in ${Math.round(delta / HOUR)} h`

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const dayOffset = Math.floor((nextReview - startOfToday.getTime()) / DAY)
  if (dayOffset === 1) return 'Due tomorrow'
  if (dayOffset <= 7) return `Due in ${dayOffset} days`
  return `Next: ${new Date(nextReview).toLocaleDateString()}`
}
