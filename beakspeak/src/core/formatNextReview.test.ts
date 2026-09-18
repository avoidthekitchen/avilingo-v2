import { describe, expect, it } from 'vitest'
import { formatNextReview } from './formatNextReview'

// A fixed mid-afternoon reference keeps the day arithmetic away from midnight.
const now = new Date(2026, 8, 18, 15, 0, 0).getTime()
const min = 60_000
const hour = 60 * min
const day = 24 * hour

describe('formatNextReview', () => {
  it('reports a past or present due time as due now', () => {
    expect(formatNextReview(now - 5 * min, now)).toBe('Due now')
    expect(formatNextReview(now, now)).toBe('Due now')
  })

  it('uses minutes and hours within the day', () => {
    expect(formatNextReview(now + 20 * 1000, now)).toBe('Due in 1 min')
    expect(formatNextReview(now + 10 * min, now)).toBe('Due in 10 min')
    expect(formatNextReview(now + 3 * hour, now)).toBe('Due in 3 h')
  })

  it('uses tomorrow and day counts within a week', () => {
    expect(formatNextReview(now + day, now)).toBe('Due tomorrow')
    expect(formatNextReview(now + 5 * day, now)).toBe('Due in 5 days')
  })

  it('falls back to the calendar date beyond a week', () => {
    const later = now + 30 * day
    expect(formatNextReview(later, now)).toBe(`Next: ${new Date(later).toLocaleDateString()}`)
  })
})
