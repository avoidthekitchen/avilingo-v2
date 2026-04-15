import { describe, it, expect } from 'vitest'
import { createNewProgress, scheduleReview, isDue, ratingFromOutcome } from './fsrs'
import { Rating } from 'ts-fsrs'

describe('createNewProgress', () => {
  it('creates progress with new state and introduced false', () => {
    const p = createNewProgress('amro')
    expect(p.speciesId).toBe('amro')
    expect(p.state).toBe('new')
    expect(p.introduced).toBe(false)
    expect(p.reps).toBe(0)
  })
})

describe('scheduleReview', () => {
  it('transitions new card to learning on Good rating', () => {
    const p = createNewProgress('amro')
    const updated = scheduleReview({ ...p, introduced: true }, Rating.Good)
    expect(updated.reps).toBe(1)
    expect(updated.state).toBe('learning')
    expect(updated.nextReview).toBeDefined()
  })

  it('schedules shorter intervals for Again rating', () => {
    const p = createNewProgress('amro')
    const good = scheduleReview({ ...p, introduced: true }, Rating.Good)
    const again = scheduleReview({ ...p, introduced: true }, Rating.Again)
    // Again should have shorter interval than Good
    expect(again.scheduledDays).toBeLessThanOrEqual(good.scheduledDays)
  })
})

describe('isDue', () => {
  it('returns false for non-introduced species', () => {
    const p = createNewProgress('amro')
    expect(isDue(p)).toBe(false)
  })

  it('returns true when nextReview is in the past', () => {
    const p = createNewProgress('amro')
    p.introduced = true
    p.nextReview = Date.now() - 1000
    expect(isDue(p)).toBe(true)
  })

  it('returns false when nextReview is in the future', () => {
    const p = createNewProgress('amro')
    p.introduced = true
    p.nextReview = Date.now() + 100000
    expect(isDue(p)).toBe(false)
  })
})

describe('ratingFromOutcome', () => {
  it('returns Again for incorrect', () => {
    expect(ratingFromOutcome(false, 1000, 'three_choice')).toBe(Rating.Again)
  })

  it('returns Easy for fast correct three_choice', () => {
    expect(ratingFromOutcome(true, 2000, 'three_choice')).toBe(Rating.Easy)
  })

  it('returns Good for normal correct three_choice', () => {
    expect(ratingFromOutcome(true, 4000, 'three_choice')).toBe(Rating.Good)
  })

  it('returns Hard for slow correct three_choice', () => {
    expect(ratingFromOutcome(true, 8000, 'three_choice')).toBe(Rating.Hard)
  })

  it('uses different thresholds for same_different', () => {
    // 3s is "fast" for same_different
    expect(ratingFromOutcome(true, 3000, 'same_different')).toBe(Rating.Easy)
    // 5s is "normal" for same_different but would be normal for three_choice too
    expect(ratingFromOutcome(true, 5000, 'same_different')).toBe(Rating.Good)
    // 11s is "slow" for same_different
    expect(ratingFromOutcome(true, 11000, 'same_different')).toBe(Rating.Hard)
  })
})
