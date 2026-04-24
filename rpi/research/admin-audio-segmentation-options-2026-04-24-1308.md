# Admin Audio Segmentation Options

Timestamp: 2026-04-24 13:08 America/Los_Angeles

## Context

Issue #23 proposes improving BeakSpeak's admin audio trimming workflow. The current system already has a persisted `candidate.segment` concept and `download_media.py` honors stored segment windows during normalization/export. The gap is that curators cannot edit those windows in the admin panel, and the fallback trimming path can choose poor regions when useful vocalizations appear later in a recording.

The product needs two different audio experiences:

- Admin curation: review enough source audio to make an informed choice, including silence, context, competing species, and BirdNET evidence.
- App runtime: ship only short normalized clips for selected song/call assets.

These should not be forced into one audio artifact.

## Recommended Direction

Separate the audio pipeline into three concepts:

1. `source_audio`: full candidate audio cached locally for admin review only.
2. `analysis_window`: a bounded region, usually 20-30 seconds, selected cheaply by FFmpeg and optionally analyzed by BirdNET Analyzer.
3. `segment`: the final export window used by the BeakSpeak app, targeting 2-5 seconds.

This keeps the admin panel information-rich without requiring the app to ship large files. It also caps BirdNET runtime by analyzing short candidate windows rather than entire long recordings.

Suggested data shape:

```json
{
  "source_audio": {
    "status": "cached",
    "local_path": "admin/source-audio/american-robin/123456.mp3",
    "duration_s": 82.4
  },
  "analysis_window": {
    "status": "ffmpeg_energy_window",
    "start_s": 42.5,
    "end_s": 72.5,
    "duration_s": 30.0
  },
  "analysis": {
    "status": "analyzed",
    "provider": "birdnet",
    "window_start_s": 42.5,
    "target_detections": [],
    "overlap_detections": []
  },
  "segment": {
    "status": "manual",
    "start_s": 48.2,
    "end_s": 58.2,
    "duration_s": 10.0
  }
}
```

BirdNET detections should be converted to full-source timestamps where practical. If detections remain relative to the extracted analysis clip, the payload must make that explicit and the admin UI must offset them consistently.

## Option 0: Manual Trim Existing Selected Clips

Value: High
Complexity: Low

This is the smallest useful scope if the currently selected clips and existing BirdNET metadata are mostly good. The goal is not to improve candidate discovery or re-run analysis. The goal is only to remove unwanted silence before and after the good part of already-selected audio for the final BeakSpeak app export.

### What Changes

- Add simple start/end trim controls in the admin panel for selected candidate clips.
- Persist manual trims to the existing `candidate.segment` field with `status: "manual"`.
- Add `reset trim` or `reset to auto` to clear manual segment overrides.
- Keep existing `candidate.analysis` BirdNET metadata unchanged.
- Keep current selected song/call choices unchanged.
- Confirm `download_media.py` gives manual `candidate.segment` precedence during export.
- Add a minimal `--force-audio` or equivalent regeneration path so existing exported `.ogg` files update after trim changes.

### What Does Not Change

- Do not add source-audio caching yet.
- Do not add `analysis_window` yet.
- Do not re-run BirdNET Analyzer.
- Do not add full waveform/spectrogram editing yet.
- Do not add interactive `Analyze selected range`.
- Do not redesign the asset pipeline into separate admin source and app export stores yet.

### Benefits

- Directly addresses the immediate problem: good clips with extra silence.
- Reuses the current selected clips and BirdNET metadata.
- Builds on existing `candidate.segment` support rather than adding a new data model.
- Low implementation risk because it mirrors the existing role-assignment persistence pattern.
- Creates a foundation for richer manual segment editing later.

### Costs / Risks

- Curators can only trim what they can currently preview. If the admin is previewing already-normalized output, this does not recover useful audio outside that file.
- Does not improve bad automatic candidate choices.
- Does not reduce BirdNET runtime.
- Needs export invalidation; otherwise saved trims may not be reflected when existing app audio files are skipped.

### Best Fit

Choose this first if current selected clips are mostly good and the near-term need is only to tighten app audio segments.

## Option 1: Manual Segment Editor + Full Source Cache

Value: High
Complexity: Medium

Build the workflow around human curation first.

### What Changes

- Cache full candidate audio files for admin review in a local-only directory outside deployed app assets.
- Admin panel previews full source audio.
- Add segment start/end controls to each candidate card.
- Persist manual windows to `candidate.segment` with `status: "manual"`.
- Add `reset to auto` to clear manual segment and return to heuristic behavior.
- Exporter generates app audio only for selected candidates, using persisted `candidate.segment`.

### Benefits

- Directly solves the core curation problem.
- Keeps the app bundle small.
- Avoids making BirdNET required for basic curation.
- Lowest risk path to useful admin improvements.

### Costs / Risks

- Does not improve automated suggestions much by itself.
- Curators may spend more time manually finding the right vocalization in long recordings.
- Needs clear cache/export invalidation so changed segments regenerate app audio.

### Best Fit

Choose this if the immediate priority is reliable curator control and smaller shipped assets.

## Option 2: FFmpeg Analysis Window + BirdNET On Bounded Clips

Value: High
Complexity: Medium-High

Use FFmpeg as a cheap preselector, then run BirdNET only on a short extracted window.

### What Changes

- Run FFmpeg silence/energy detection across full source audio.
- Select one 20-30 second `analysis_window`, using longest/loudest active region with padding.
- Extract that window to a temporary file.
- Run BirdNET Analyzer only on that extracted file.
- Persist `analysis_window` and BirdNET target/overlap metadata.
- Admin panel shows full source audio, analysis window overlay, BirdNET detections, and editable final segment overlay.

### Benefits

- Preserves useful BirdNET metadata without analyzing every second of every source recording.
- Keeps runtime bounded: 450 candidates means at most roughly 450 x 20-30 seconds of BirdNET input.
- Gives curators better evidence than waveform/silence detection alone.
- Maintains separation between analysis and final export segment.

### Costs / Risks

- FFmpeg can choose the wrong analysis window, causing BirdNET to miss the best vocalization.
- Requires more UI state: source audio, analysis window, detections, final segment.
- Requires careful timestamp handling between extracted clip time and full source time.
- Still adds BirdNET runtime, though much less than full-file analysis.

### Best Fit

Choose this if BirdNET evidence is important during review but pipeline runtime must remain controlled.

## Option 2A: Lean Bounded BirdNET Analysis

Value: High
Complexity: Medium

This is the recommended 80/20 path if Option 2 feels too much like a redesign. Keep the current pipeline concepts mostly intact, but reduce BirdNET cost by inserting a short FFmpeg-selected analysis window before BirdNET runs.

### What Changes

- Keep `candidate.analysis` as the place where BirdNET target and overlap detections live.
- Keep `candidate.segment` as the final export window.
- Add only one lightweight metadata object, either `candidate.analysis_window` or `candidate.analysis.window`.
- Use FFmpeg to select a 20-30 second window before running BirdNET.
- Run BirdNET on that extracted window instead of the whole source file.
- Convert BirdNET timestamps back to original source-audio timestamps before saving.
- Admin initially displays the analysis window and evidence as read-only metadata; manual segment editing can come later or remain numeric-only at first.

### What Does Not Change

- Do not introduce multiple source/export asset types in the first pass.
- Do not support multiple analysis windows yet.
- Do not add interactive `Analyze selected range` yet.
- Do not build a full waveform/spectrogram editor yet.
- Do not make the admin server regenerate exports immediately.

### Benefits

- Gets most BirdNET runtime savings without reworking the whole admin architecture.
- Preserves the useful target/overlap metadata curators already value.
- Keeps the current persisted `analysis` and `segment` responsibilities understandable.
- Creates a migration path to full Option 2 later.

### Costs / Risks

- Admin review may still depend on existing normalized audio unless source-audio preview is added separately.
- If FFmpeg chooses the wrong 20-30 second window, BirdNET evidence may miss the best vocalization.
- The model still needs clear timestamp semantics.

### Best Fit

Choose this as the next implementation step if the goal is maximum BirdNET value with minimum disruption.

## Option 3: Interactive Admin-Driven Analysis

Value: Very High
Complexity: High

Make BirdNET analysis a curator-triggered action rather than a batch default.

### What Changes

- Start with Option 1 or Option 2 basics.
- Admin panel lets curator select a region and click `Analyze selected range`.
- Server extracts the selected range and runs BirdNET on demand.
- Persist one or more analysis windows per candidate.
- Admin displays previous analysis windows and detections.
- Optional: allow promoting an analyzed detection region into the final export `segment`.

### Benefits

- Avoids wasting BirdNET time on low-value clips.
- Curator can recover when automatic FFmpeg window selection is wrong.
- Supports deeper review of difficult candidates with overlap species or uncertain calls.
- Scales better as candidate count grows because analysis becomes targeted.

### Costs / Risks

- More backend orchestration in the local admin server.
- UI is more complex: region selection, progress state, errors, multiple analysis results.
- BirdNET execution latency becomes part of the curator's interactive workflow.
- Needs robust locking/status handling so repeated clicks or failed runs do not corrupt state.

### Best Fit

Choose this after the basic curation workflow is working, especially if curators frequently need BirdNET on a different window than the automated choice.

## Recommended Implementation Sequence

1. Implement Option 0 first if current selected clips are mostly good: manual trim existing selected clips, persist to `candidate.segment`, and add export regeneration.
2. Add source-audio preview only if curators cannot make good trim decisions from the current admin preview.
3. Implement Option 2A next if BirdNET runtime or analysis freshness becomes the bottleneck: bounded BirdNET analysis using a persisted analysis window.
4. Add minimal admin visibility for the analysis window so curators know what BirdNET reviewed.
5. Add full Option 2 overlays or Option 3 interactive analysis only if real curation shows that the lean path misses too often.

This sequence avoids overbuilding while preserving a clear path to richer BirdNET-assisted review. It also avoids committing immediately to a larger admin redesign.

## Pipeline Notes

### Source Audio Cache

Full candidate audio should be local-only and not deployed with the app. Candidate files can be keyed by species and Xeno-canto ID, for example:

```text
admin/source-audio/{species_id}/{xc_id}.{ext}
```

The admin server can serve these files at an endpoint such as:

```text
/source-audio/{species_id}/{xc_id}
```

The deployed app should continue reading only from `beakspeak/public/content/audio`.

### Export Audio

The export step should only produce normalized app clips for selected candidates. It should use this precedence:

1. Manual `candidate.segment` if present.
2. Persisted auto `candidate.segment` if present.
3. FFmpeg fallback segment.
4. Default first 20 seconds only as a last resort.

The exporter also needs invalidation. If an output file already exists but the selected segment changed, it must regenerate. Possible approaches:

- Add `--force-audio`.
- Store a sidecar manifest with source URL, segment start/end, and export parameters.
- Compare current candidate segment to a previous export fingerprint.
- Delete/regenerate only the affected candidate from admin after saving a segment.

The sidecar/fingerprint approach is the most robust long-term option.

### BirdNET Runtime Control

BirdNET should not run on every full source file by default. Suggested controls:

- `--analyze-missing-only`
- `--species american-robin`
- `--xc-id 123456`
- `--limit 20`
- `--analysis-window-duration 30`
- `--force-analysis`

Persist enough metadata to skip re-analysis unless the source audio or analysis window changes.

### FFmpeg Window Selection

The current `download_media.py` fallback should not select the first non-silent segment of sufficient duration. Better heuristics:

- Find all active regions using `silencedetect`.
- Prefer high-energy or long active regions.
- Apply padding.
- Clamp to a 20-30 second analysis window.
- Avoid choosing tiny loud noise bursts by requiring minimum active duration.

If possible, centralize this logic with the existing segment selection utilities in `populate_content.py` rather than maintaining divergent heuristics in multiple files.

## Admin UI Notes

The admin panel should distinguish overlays visually:

- Source audio duration: full waveform/progress track.
- Analysis window: shaded region showing what BirdNET analyzed.
- BirdNET detections: markers or bands within the analysis window.
- Export segment: editable start/end handles.

Minimum viable controls:

- Numeric start/end fields.
- Save segment.
- Reset to auto.
- Play full source.
- Play selected segment preview.

Better controls:

- Drag handles on a waveform or spectrogram.
- Jump-to-detection controls from BirdNET evidence.
- Analyze selected range.

## Open Questions

1. Where should full source audio live?
   Recommendation: use an ignored cache outside deployed app assets, preferably `.cache/beakspeak/source-audio/{species_id}/{xc_id}.{ext}`. This avoids confusing source assets with app-shipped assets and keeps `admin/` mostly source code.
2. Should source audio files be committed, ignored, or always reconstructed from Xeno-canto URLs?
   Recommendation: ignore them and reconstruct from Xeno-canto URLs when needed. Commit only metadata, segment choices, and analysis results. Audio cache should be treated as a local build artifact.
3. Should `analysis_window` support only one window initially, or should the model allow multiple windows from the start?
   Recommendation: support one window initially. Use a single object, not an array. Multiple windows add UI and persistence complexity before there is evidence they are needed.
4. Should manual segment editing clamp to a fixed app duration target, or allow variable durations up to a max such as 20 seconds?
   Recommendation: allow variable durations, but validate with a minimum and maximum. Given the current target is 2-5 seconds, default new manual selections to 5 seconds and warn or require confirmation above 10 seconds. Hard cap at 20 seconds unless there is a specific training reason to exceed it.
5. Should BirdNET detections be stored as full-source timestamps or analysis-window-relative timestamps?
   Recommendation: store full-source timestamps for detections and also store `analysis_window.start_s`. Full-source timestamps simplify admin overlays and future manual segment editing. Keeping the window start preserves traceability to the extracted BirdNET input.
6. Should the admin server regenerate exported app audio immediately after segment save, or should export remain a separate explicit command?
   Recommendation: keep export as a separate explicit command for now. Add visible stale/export-needed state later if needed. Immediate regeneration increases admin server responsibility and can hide slow or failing FFmpeg work inside a UI save action.
7. What is the acceptable upper bound for BirdNET batch runtime during normal curation: minutes, tens of minutes, or overnight?
   Recommendation: target single-digit minutes for normal incremental runs and make longer analysis explicitly opt-in. The default should be `missing-only` bounded-window analysis with species/clip filters. Full refresh can be allowed as an intentional overnight-style command, not the normal path.
8. Should commercial export mode affect which source candidates are cached/analyzed, or only which selected candidates are shipped?
   Recommendation: only affect what ships. Cache and analyze all useful candidates for curation unless disk/runtime pressure becomes a real problem. Curators may need non-commercial candidates as reference/context even if they are excluded from commercial export.

## Recommendation

Use Option 0 as the near-term path if the current selected clips are mostly good. It captures the immediate value with the least new architecture: persist manual trims to `candidate.segment`, keep existing BirdNET metadata, and regenerate exported app audio when trims change.

If review shows that current previews are not enough context, add source-audio preview. If BirdNET runtime or stale analysis becomes the next bottleneck, move to Option 2A. Keep full Option 2 and interactive `Analyze selected range` as later enhancements if automated window selection proves unreliable.
