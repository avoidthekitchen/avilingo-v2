import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCandidateSegment,
  formatPlaybackTime,
  getSegmentDurationWarning,
  normalizeSegment,
  resetCandidateSegment,
} from './trim-state.mjs'

test('normalizeSegment exposes saved manual trim values for selected clip controls', () => {
  assert.deepEqual(
    normalizeSegment({
      status: 'manual',
      start_s: 1.25,
      end_s: 6.75,
      duration_s: 5.5,
    }),
    {
      status: 'manual',
      start_s: '1.25',
      end_s: '6.75',
      duration_s: 5.5,
    },
  )
})

test('duration warnings flag unusually short or long segments without blocking valid structure', () => {
  assert.equal(getSegmentDurationWarning(1, 1.5), 'Segment is shorter than 1 second.')
  assert.equal(getSegmentDurationWarning(1, 22), 'Segment is longer than 20 seconds.')
  assert.equal(getSegmentDurationWarning(1, 8), '')
})

test('formatPlaybackTime renders current audio time for clip playback', () => {
  assert.equal(formatPlaybackTime(0), '0:00.0')
  assert.equal(formatPlaybackTime(3.42), '0:03.4')
  assert.equal(formatPlaybackTime(65.98), '1:06.0')
  assert.equal(formatPlaybackTime(Number.NaN), '0:00.0')
})

test('applyCandidateSegment and resetCandidateSegment update in-memory candidate state', () => {
  const candidate = { selected_role: 'song' }

  applyCandidateSegment(candidate, { status: 'manual', start_s: 2, end_s: 5 })
  assert.deepEqual(candidate.segment, {
    status: 'manual',
    start_s: 2,
    end_s: 5,
    duration_s: 3,
    confidence: null,
    fallback_reason: null,
  })

  resetCandidateSegment(candidate)
  assert.deepEqual(candidate.segment, {
    status: 'not_set',
    start_s: null,
    end_s: null,
    duration_s: null,
    confidence: null,
    fallback_reason: null,
  })
})
