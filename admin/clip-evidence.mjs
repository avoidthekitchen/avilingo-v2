function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatNumber(value, digits = 1) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  const fixed = numeric.toFixed(digits)
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function humanizeCode(value) {
  if (!value) return null
  return String(value).replaceAll('_', ' ')
}

function getTopOverlapSpecies(analysis) {
  const summarySpecies = analysis?.summary?.top_overlap_species
  if (Array.isArray(summarySpecies) && summarySpecies.length) {
    return summarySpecies
  }

  const seen = new Set()
  const species = []
  for (const detection of analysis?.overlap_detections || []) {
    const commonName = String(detection?.common_name || '').trim()
    if (!commonName || seen.has(commonName)) continue
    seen.add(commonName)
    species.push(commonName)
    if (species.length >= 3) break
  }
  return species
}

function formatSegmentEvidence(segment) {
  const numericDuration = Number(segment?.duration_s)
  const duration = Number.isFinite(numericDuration) ? numericDuration.toFixed(1) : null
  const status = segment?.status
  if (!duration || !status || status === 'not_set') return null

  const labels = {
    birdnet_target_centered: 'Target-centered',
    birdnet_extended_context: 'Extended context',
    ffmpeg_heuristic: 'FFmpeg heuristic',
    ffmpeg_full_clip_fallback: 'FFmpeg fallback',
  }

  return `${labels[status] || humanizeCode(status)} ${duration}s`
}

function buildBirdnetEvidence(clip) {
  const analysis = clip?.analysis || {}
  if (analysis.status === 'ok') {
    const targetCount = Number(analysis?.summary?.target_detection_count ?? analysis?.target_detections?.length ?? 0)
    const overlapCount = Number(analysis?.summary?.overlap_detection_count ?? analysis?.overlap_detections?.length ?? 0)
    const maxConfidence = formatNumber(analysis?.summary?.max_target_confidence, 2)
    const mainParts = [
      `Target ${pluralize(targetCount, 'detection')}`,
      maxConfidence ? `max ${maxConfidence}` : null,
      pluralize(overlapCount, 'overlap'),
    ].filter(Boolean)

    const detailParts = []
    const overlapSpecies = getTopOverlapSpecies(analysis)
    if (overlapSpecies.length) {
      detailParts.push(`Overlap species: ${overlapSpecies.join(', ')}`)
    }

    const segmentEvidence = formatSegmentEvidence(clip?.segment)
    if (segmentEvidence) {
      detailParts.push(`Segment: ${segmentEvidence}`)
    }

    return {
      className: 'badge-analysis-ok',
      pillLabel: 'BirdNET',
      main: mainParts.join(' · '),
      detail: detailParts.join(' · '),
    }
  }

  const statusLabels = {
    not_analyzed: 'BirdNET not analyzed',
    unavailable: 'BirdNET unavailable',
    parse_failed: 'BirdNET parse failed',
  }
  const detailReason = humanizeCode(analysis?.failure?.code) || analysis?.failure?.message || 'analysis unavailable'
  return {
    className: 'badge-analysis-degraded',
    pillLabel: 'Degraded analysis',
    main: statusLabels[analysis?.status] || 'BirdNET unavailable',
    detail: `Ranking is using metadata-only fallback for this clip (${detailReason}).`,
  }
}

function buildRankingEvidence(clip) {
  const rankingSignals = clip?.ranking_signals || {}
  const parts = []

  const xcScore = formatNumber(rankingSignals?.xc_score, 1)
  if (xcScore) {
    parts.push(`XC base ${xcScore}`)
  }

  const backgroundSpecies = Array.isArray(rankingSignals?.background_species)
    ? rankingSignals.background_species
    : []
  if (backgroundSpecies.length) {
    parts.push(`Background species ${backgroundSpecies.length}`)
  }

  const segmentEvidence = formatSegmentEvidence(clip?.segment)
  if (segmentEvidence) {
    parts.push(segmentEvidence)
  }

  if (!parts.length) return null

  const detailParts = []
  if (backgroundSpecies.length) {
    detailParts.push(`Background: ${backgroundSpecies.join(', ')}`)
  }

  const backgroundPenalty = Number(rankingSignals?.background_species_penalty)
  if (Number.isFinite(backgroundPenalty) && backgroundPenalty < 0) {
    detailParts.push(`Penalty ${backgroundPenalty}`)
  }

  return {
    main: parts.join(' · '),
    detail: detailParts.join(' · '),
  }
}

export function buildLicenseBadge(clip) {
  if (clip?.commercial_ok === false) {
    return {
      className: 'badge-license-nc',
      label: 'Non-commercial',
      title: 'Non-commercial license',
    }
  }

  return {
    className: 'badge-license-commercial',
    label: 'Commercial OK',
    title: 'Commercial-compatible license',
  }
}

export function renderClipEvidenceHtml(clip) {
  const licenseBadge = buildLicenseBadge(clip)
  const birdnet = buildBirdnetEvidence(clip)
  const ranking = buildRankingEvidence(clip)

  return `
    <div class="evidence-stack">
      <div class="evidence-row">
        <span class="badge ${escapeHtml(licenseBadge.className)}" title="${escapeHtml(licenseBadge.title)}">${escapeHtml(licenseBadge.label)}</span>
        <span class="badge ${escapeHtml(birdnet.className)}">${escapeHtml(birdnet.pillLabel)}</span>
      </div>
      <div class="evidence-block${birdnet.className === 'badge-analysis-degraded' ? ' evidence-block-degraded' : ''}">
        <div class="evidence-label">BirdNET</div>
        <div class="evidence-main">${escapeHtml(birdnet.main)}</div>
        ${birdnet.detail ? `<div class="evidence-detail">${escapeHtml(birdnet.detail)}</div>` : ''}
      </div>
      ${
        ranking
          ? `
        <div class="evidence-block">
          <div class="evidence-label">Ranking Support</div>
          <div class="evidence-main">${escapeHtml(ranking.main)}</div>
          ${ranking.detail ? `<div class="evidence-detail">${escapeHtml(ranking.detail)}</div>` : ''}
        </div>
      `
          : ''
      }
    </div>
  `
}
