import test from 'node:test'
import assert from 'node:assert/strict'

import { buildLicenseBadge, renderClipEvidenceHtml } from './clip-evidence.mjs'

test('commercial-compatible candidates render an explicit commercial badge and BirdNET summary', () => {
  const clip = {
    commercial_ok: true,
    analysis: {
      status: 'ok',
      summary: {
        target_detection_count: 2,
        overlap_detection_count: 1,
        max_target_confidence: 0.91,
        top_overlap_species: ['House Finch'],
      },
    },
    ranking_signals: {
      xc_score: 58,
      background_species: ['American Crow'],
      background_species_penalty: -18,
    },
    segment: {
      status: 'birdnet_target_centered',
      duration_s: 7,
    },
  }

  assert.deepEqual(buildLicenseBadge(clip), {
    className: 'badge-license-commercial',
    label: 'Commercial OK',
    title: 'Commercial-compatible license',
  })

  const html = renderClipEvidenceHtml(clip)
  assert.match(html, /Commercial OK/)
  assert.match(html, /Gate pass/)
  assert.match(html, /BG 1/)
  assert.match(html, /Target 2 detections · max 0\.91 · 1 overlap/)
  assert.match(html, /Overlap species: House Finch/)
  assert.match(html, /XC base 58/)
  assert.match(html, /Background species 1/)
  assert.match(html, /Target-centered 7\.0s/)
})

test('non-commercial candidates render a distinct non-commercial badge', () => {
  const clip = {
    commercial_ok: false,
    analysis: {
      status: 'ok',
      summary: {
        target_detection_count: 1,
        overlap_detection_count: 0,
        max_target_confidence: 0.77,
        top_overlap_species: [],
      },
    },
  }

  assert.deepEqual(buildLicenseBadge(clip), {
    className: 'badge-license-nc',
    label: 'Non-commercial',
    title: 'Non-commercial license',
  })

  const html = renderClipEvidenceHtml(clip)
  assert.match(html, /Non-commercial/)
  assert.match(html, /Gate pass/)
})

test('missing BirdNET data renders an explicit degraded-analysis state', () => {
  const clip = {
    commercial_ok: true,
    analysis: {
      status: 'unavailable',
      failure: {
        code: 'birdnet_not_configured',
        message: 'BirdNET is not configured.',
      },
    },
    ranking_signals: {
      xc_score: 36.4,
      background_species: [],
      background_species_penalty: 0,
    },
    segment: {
      status: 'ffmpeg_full_clip_fallback',
      duration_s: 12,
      fallback_reason: 'birdnet_not_configured',
    },
  }

  const html = renderClipEvidenceHtml(clip)
  assert.match(html, /Degraded analysis/)
  assert.match(html, /Gate fail/)
  assert.match(html, /BirdNET unavailable/)
  assert.match(html, /birdnet not configured/i)
  assert.match(html, /metadata-only fallback/)
  assert.doesNotMatch(html, /Target \d detections/)
})
