const VALID_SELECTED_ROLES = new Set(['none', 'song', 'call'])

function normalizeSelectedRole(value) {
  return VALID_SELECTED_ROLES.has(value) ? value : 'none'
}

function compareCandidates(left, right) {
  const leftRank = Number.isFinite(Number(left.rank)) ? Number(left.rank) : Number.POSITIVE_INFINITY
  const rightRank = Number.isFinite(Number(right.rank)) ? Number(right.rank) : Number.POSITIVE_INFINITY
  if (leftRank !== rightRank) return leftRank - rightRank

  const leftScore = Number.isFinite(Number(left.score)) ? Number(left.score) : Number.NEGATIVE_INFINITY
  const rightScore = Number.isFinite(Number(right.score)) ? Number(right.score) : Number.NEGATIVE_INFINITY
  if (leftScore !== rightScore) return rightScore - leftScore

  return String(left.xc_id || '').localeCompare(String(right.xc_id || ''))
}

function ensureUnifiedCandidates(species) {
  if (!species.audio_clips) species.audio_clips = {}
  if (Array.isArray(species.audio_clips.candidates)) return species.audio_clips.candidates

  const songs = (species.audio_clips.songs || []).map((clip, index) => ({
    ...clip,
    candidate_id: clip.candidate_id || `legacy:${species.id}:song:${index}:${clip.xc_id || ''}`,
    source_role: 'song',
    selected_role: clip.selected ? 'song' : normalizeSelectedRole(clip.selected_role),
  }))
  const calls = (species.audio_clips.calls || []).map((clip, index) => ({
    ...clip,
    candidate_id: clip.candidate_id || `legacy:${species.id}:call:${index}:${clip.xc_id || ''}`,
    source_role: 'call',
    selected_role: clip.selected ? 'call' : normalizeSelectedRole(clip.selected_role),
  }))

  species.audio_clips.candidates = [...songs, ...calls]
  return species.audio_clips.candidates
}

export function getOrderedSpeciesCandidates(species) {
  return [...ensureUnifiedCandidates(species)].sort(compareCandidates)
}

export function getSpeciesRoleCounts(species) {
  const counts = { song: 0, call: 0, assigned: 0, total: 0 }
  for (const candidate of ensureUnifiedCandidates(species)) {
    counts.total += 1
    const selectedRole = normalizeSelectedRole(candidate.selected_role)
    if (selectedRole === 'song' || selectedRole === 'call') {
      counts[selectedRole] += 1
      counts.assigned += 1
    }
  }
  return counts
}

export function getGlobalRoleCounts(speciesList) {
  return (speciesList || []).reduce(
    (totals, species) => {
      const counts = getSpeciesRoleCounts(species)
      totals.song += counts.song
      totals.call += counts.call
      totals.assigned += counts.assigned
      totals.total += counts.total
      return totals
    },
    { song: 0, call: 0, assigned: 0, total: 0 },
  )
}

export function getSpeciesSidebarBadge(species) {
  const counts = getSpeciesRoleCounts(species)
  return `S${counts.song} C${counts.call}`
}

export function meetsCurationTarget(species, targetPerRole = 2) {
  const counts = getSpeciesRoleCounts(species)
  return counts.song >= targetPerRole && counts.call >= targetPerRole
}

export function applyCandidateRole(species, candidateId, xcId, selectedRole) {
  const normalizedRole = normalizeSelectedRole(selectedRole)
  const candidate = ensureUnifiedCandidates(species).find(
    (item) =>
      (candidateId && String(item.candidate_id || '') === String(candidateId)) ||
      String(item.xc_id || '') === String(xcId),
  )
  if (!candidate) {
    throw new Error(`candidate ${candidateId || xcId} not found for species ${species.id}`)
  }
  candidate.selected_role = normalizedRole
  return candidate
}
