export function normalizeSegment(segment) {
  const status = segment?.status === 'manual' ? 'manual' : 'not_set'
  const start = Number(segment?.start_s)
  const end = Number(segment?.end_s)
  if (status !== 'manual' || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return { status: 'not_set', start_s: '', end_s: '', duration_s: null }
  }
  return {
    status,
    start_s: String(start),
    end_s: String(end),
    duration_s: Number((end - start).toFixed(3)),
  }
}

export function getSegmentDurationWarning(startValue, endValue) {
  const start = Number(startValue)
  const end = Number(endValue)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return ''

  const duration = end - start
  if (duration < 1) return 'Segment is shorter than 1 second.'
  if (duration > 20) return 'Segment is longer than 20 seconds.'
  return ''
}

export function applyCandidateSegment(candidate, segment) {
  candidate.segment = normalizeSegmentForCandidate(segment)
  return candidate
}

export function resetCandidateSegment(candidate) {
  candidate.segment = {
    status: 'not_set',
    start_s: null,
    end_s: null,
    duration_s: null,
    confidence: null,
    fallback_reason: null,
  }
  return candidate
}

function normalizeSegmentForCandidate(segment) {
  const status = segment?.status === 'manual' ? 'manual' : 'not_set'
  const start = Number(segment?.start_s)
  const end = Number(segment?.end_s)
  if (status !== 'manual' || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return resetCandidateSegment({}).segment
  }
  return {
    status: 'manual',
    start_s: Number(start.toFixed(3)),
    end_s: Number(end.toFixed(3)),
    duration_s: Number((end - start).toFixed(3)),
    confidence: null,
    fallback_reason: null,
  }
}
