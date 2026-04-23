import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyCandidateRole,
  getOrderedSpeciesCandidates,
  getSpeciesRoleCounts,
  getSpeciesSidebarBadge,
} from './review-state.mjs'

function makeSpecies() {
  return {
    id: 'sp1',
    audio_clips: {
      candidates: [
        {
          candidate_id: 'xc:20:call:0',
          xc_id: '20',
          source_role: 'call',
          selected_role: 'call',
          rank: 2,
          score: 91.2,
        },
        {
          candidate_id: 'xc:10:song:0',
          xc_id: '10',
          source_role: 'song',
          selected_role: 'none',
          rank: 1,
          score: 97.5,
        },
        {
          candidate_id: 'xc:30:song:1',
          xc_id: '30',
          source_role: 'song',
          selected_role: 'song',
          rank: 3,
          score: 88.4,
        },
      ],
    },
  }
}

test('getOrderedSpeciesCandidates returns one mixed list ordered by review rank', () => {
  const ordered = getOrderedSpeciesCandidates(makeSpecies())

  assert.deepEqual(
    ordered.map((candidate) => candidate.xc_id),
    ['10', '20', '30'],
  )
})

test('role counts and badge reflect assigned songs and calls', () => {
  const counts = getSpeciesRoleCounts(makeSpecies())

  assert.deepEqual(counts, { song: 1, call: 1, assigned: 2, total: 3 })
  assert.equal(getSpeciesSidebarBadge(makeSpecies()), 'S1 C1')
})

test('applyCandidateRole updates assignment and supports removal to none', () => {
  const species = makeSpecies()

  applyCandidateRole(species, 'xc:10:song:0', '10', 'call')
  assert.equal(getSpeciesRoleCounts(species).call, 2)
  assert.equal(getSpeciesRoleCounts(species).song, 1)

  applyCandidateRole(species, 'xc:20:call:0', '20', 'none')
  assert.deepEqual(getSpeciesRoleCounts(species), { song: 1, call: 1, assigned: 2, total: 3 })
})

test('applyCandidateRole only falls back to xc_id when candidateId is absent', () => {
  const species = {
    id: 'sp2',
    audio_clips: {
      candidates: [
        {
          candidate_id: 'xc:44:song:0',
          xc_id: '44',
          source_role: 'song',
          selected_role: 'song',
        },
        {
          candidate_id: 'xc:44:call:0',
          xc_id: '44',
          source_role: 'call',
          selected_role: 'call',
        },
      ],
    },
  }

  applyCandidateRole(species, 'xc:44:call:0', '44', 'none')

  assert.equal(species.audio_clips.candidates[0].selected_role, 'song')
  assert.equal(species.audio_clips.candidates[1].selected_role, 'none')
})
