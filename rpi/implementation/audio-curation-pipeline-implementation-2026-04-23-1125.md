# Audio Curation Pipeline Implementation

Parent PRD: `rpi/plans/audio-curation-pipeline-prd-2026-04-23.md`

Dependency graph:

```text
Issue 1 ──> Issue 2 ──> Issue 3 ──> Issue 4 ──┐
                                               ├──> Issue 5 ──> Issue 6 ──> Issue 7 ──> Issue 9 ──┐
                                               │                                                    ├──> Issue 10
                                               └──────────────────────────────> Issue 8 ─────────────┘
```

Issues 1 and 2 can overlap slightly in design, but Issue 2 should land against the schema introduced in Issue 1.

---

## Issue 1: Candidate Pool Schema And Backward-Compatible Persistence

**Type**: AFK
**Blocked by**: None — can start immediately

### Parent PRD

`audio-curation-pipeline-prd-2026-04-23.md`

### What to build

Create the new persisted shape for a unified per-species audio candidate pool while preserving the ability to read older populated pool files and continue exporting the runtime manifest in the existing `songs` and `calls` structure.

This slice should establish the end-to-end contract for candidate identity, XC type metadata, role assignment state, licensing fields, analysis placeholders, segment fields, and schema-version handling. It should also update the local admin server and any loading code so the new pool file can be read and written safely without breaking existing workflows.

Reference the PRD sections:
- `Implementation Decisions`
- `Module Design > Curated Audio Pool Schema`

### How to verify

- **Manual**:
  1. Run the local admin server against an older `tier1_seattle_birds_populated.json`.
  2. Confirm the server loads it without crashing.
  3. Save a no-op edit and confirm the file is rewritten in the new schema.
  4. Confirm the resulting JSON still contains enough information for later export into manifest `songs` and `calls`.
- **Automated**:
  - A schema round-trip test reads an old-style populated record, normalizes it, writes it back, and preserves candidate identity, licensing fields, and selected-role state.
  - A compatibility test verifies the normalizer can handle missing BirdNET and segment fields gracefully.

### Acceptance criteria

- [x] Given an older populated pool file, when it is loaded by the new code, then it is normalized into the new unified candidate schema without losing clip identity or existing curation choices.
- [x] Given a normalized pool file, when it is saved, then it includes unified candidate records with role-assignment and analysis-ready fields.
- [x] Given a species with unified candidates, when downstream code reads it, then the data needed for later export to manifest `songs` and `calls` remains available.
- [x] Given missing new-schema fields such as BirdNET analysis or segment windows, then loading still succeeds with explicit default status rather than crashing.

### User stories addressed

- User story 21: Persist analysis metadata in the populated pool
- User story 28: Make licensing policy an export concern
- User story 29: Encapsulate optional BirdNET analysis behind a stable interface

### Tasks

- [x] **MIGRATE**: Define the unified candidate schema and normalization contract in `populate_content.py` and the implementation doc fields it depends on, including schema version, candidate identity, XC metadata, role assignment, licensing, analysis placeholders, and segment fields.
- [x] **WRITE**: Add backward-compatible pool normalization and save logic in `populate_content.py` so older `audio_clips.songs` / `audio_clips.calls` data loads into the unified candidate structure without losing prior selections.
- [x] **WRITE**: Update `admin/server.py` pool read/write paths to operate on the normalized schema while preserving safe no-op behavior for missing new fields.
- [x] **TEST**: Add fixture-driven tests for schema normalization and round-trip persistence, covering old pool input, missing BirdNET fields, and preserved candidate identity.

---

## Issue 2: Optional BirdNET Adapter With Noisy Fallback Status

**Type**: AFK
**Blocked by**: Issue 1

### Parent PRD

`audio-curation-pipeline-prd-2026-04-23.md`

### What to build

Add a thin integration layer that invokes BirdNET through an environment-configured external executable and normalizes the results into the internal schema introduced in Issue 1. When BirdNET is absent, misconfigured, or fails, the pipeline must continue through the fallback path while surfacing loud warnings in startup logs, per-species status, and summary output.

This slice should prove the optional external-tool boundary end to end without yet depending on final ranking or admin evidence presentation.

Reference the PRD sections:
- `Implementation Decisions`
- `Module Design > BirdNET Adapter`

### How to verify

- **Manual**:
  1. Run the populate workflow with `BIRDNET_*` env vars unset.
  2. Confirm the pipeline continues and prints prominent fallback warnings.
  3. Run again with the env var pointed at a working BirdNET CLI.
  4. Confirm structured analysis fields are attached to candidates.
- **Automated**:
  - A parser test consumes fixture BirdNET output and produces normalized target detections, overlap detections, and availability status.
  - A missing-binary test verifies the adapter returns structured fallback status instead of throwing uncaught errors.

### Acceptance criteria

- [x] Given BirdNET is configured and working, when candidate analysis runs, then normalized analysis results are stored in the candidate pool.
- [x] Given BirdNET is missing or the configured executable is invalid, when candidate analysis runs, then the pipeline continues with explicit fallback status and prominent warnings.
- [x] Given BirdNET output changes or is malformed, when parsing fails, then the adapter returns structured failure information instead of crashing the whole run.
- [x] Given a pipeline summary is printed, then it clearly distinguishes BirdNET-assisted runs from FFmpeg-only fallback runs.

### User stories addressed

- User story 16: Warn loudly when BirdNET is unavailable
- User story 17: Keep the system running without BirdNET
- User story 23: Integrate BirdNET through an env-configured external installation

### Tasks

- [x] **CONFIG**: Define the BirdNET environment contract in `populate_content.py` and related docs, including executable path discovery and the warning behavior for missing configuration.
- [x] **WRITE**: Add a thin BirdNET invocation and result-normalization module or helper used by `populate_content.py`, returning structured analysis status instead of raw CLI output.
- [x] **WRITE**: Thread BirdNET availability and failure status through species-level logs and final summary output so fallback runs are unmistakable.
- [x] **TEST**: Add parser and fallback tests using fixture BirdNET output plus missing-binary cases to verify structured failure handling.

---

## Issue 3: Unified Candidate Gathering With Mixed Ranking Inputs

**Type**: AFK
**Blocked by**: Issues 1-2

### Parent PRD

`audio-curation-pipeline-prd-2026-04-23.md`

### What to build

Replace the early `songs` / `calls` source-driven selection logic with a unified candidate gathering flow that collects a mixed pool per species, preserves original XC types, and computes a ranked order using Xeno-canto metadata, `also` information, licensing fields, and BirdNET-backed analysis when available.

This slice should deliver a populated mixed candidate list that is useful before manual role assignment exists, including clear rank-affecting signals and warnings when candidate quality is sparse or noisy.

Reference the PRD sections:
- `Solution`
- `Implementation Decisions`
- `Module Design > Candidate Pool Builder`
- `Module Design > Candidate Scoring Policy`

### How to verify

- **Manual**:
  1. Run the populate workflow for a few representative species.
  2. Confirm each species now produces one mixed candidate list rather than separate source-selected song/call lists.
  3. Inspect candidates and confirm XC `type`, `also`, license fields, and ranking outputs are present.
  4. Confirm obviously noisy `also` cases are penalized or filtered as intended.
- **Automated**:
  - Scoring tests verify clean high-quality single-species clips rank above weaker or noisier alternatives.
  - Fixtures covering `also`, mixed XC types, and missing BirdNET data confirm the ranking degrades gracefully.

### Acceptance criteria

- [x] Given Xeno-canto responses for a species, when population runs, then the output stores a unified ranked candidate pool rather than precommitting candidates into final app roles.
- [x] Given a candidate has original XC `type` metadata, when it is stored, then that metadata remains available for later admin review.
- [x] Given a candidate includes `also` background-species metadata, when ranking runs, then that signal materially lowers or removes the candidate from the top mixed pool.
- [x] Given BirdNET data is unavailable, then ranking still completes with explicit degraded-analysis status rather than empty output or a crash.

### User stories addressed

- User story 7: Review one mixed pool of top candidate clips
- User story 12: Penalize clips with known background birds from XC metadata
- User story 30: Surface bad-data edge cases as warnings and summary output

### Tasks

- [x] **WRITE**: Replace the early song/call-first selection in `populate_content.py` with unified candidate gathering that stores mixed candidates plus preserved XC type metadata.
- [x] **WRITE**: Implement ranking that combines XC quality, `also` metadata, license status, and BirdNET-backed signals when present, while remaining usable without BirdNET.
- [x] **WRITE**: Update summary reporting in `populate_content.py` to describe mixed-pool quality gaps and degraded-analysis cases instead of only song/call counts.
- [x] **TEST**: Add scoring and ranking tests with representative fixtures for clean clips, `also` clips, mixed XC types, and missing analysis.

---

## Issue 4: Target-Centered Segment Proposal And Persisted Clip Windows

**Type**: AFK
**Blocked by**: Issues 1-3

### Parent PRD

`audio-curation-pipeline-prd-2026-04-23.md`

### What to build

Implement segment selection that stores a target-centered export window per candidate, using BirdNET evidence when available and FFmpeg heuristics otherwise. The output should strongly prefer a 6-8 second window and fall back up to 12 seconds when necessary, with explicit fallback reasons captured in the pool.

This slice should make segment windows a first-class persisted decision so later admin review and media export operate on the same clip boundaries.

Reference the PRD sections:
- `Solution`
- `Implementation Decisions`
- `Module Design > Segment Selection Engine`

### How to verify

- **Manual**:
  1. Run population for a few species with and without BirdNET available.
  2. Inspect stored segment start/end values in the pool file.
  3. Spot-check resulting candidate previews or derived output files to confirm windows center on the target vocalization.
- **Automated**:
  - Segment-selection tests verify ideal BirdNET-backed cases choose 6-8 second windows.
  - Fallback tests verify longer windows up to 12 seconds are chosen when the source demands more context.

### Acceptance criteria

- [x] Given a candidate with strong BirdNET target detections, when segment selection runs, then the stored window centers on the target vocalization and prefers a 6-8 second duration.
- [x] Given no suitable short target-centered region exists, when segment selection runs, then it may extend the window up to 12 seconds with a recorded fallback reason.
- [x] Given BirdNET analysis is unavailable, when segment selection runs, then FFmpeg-only heuristics produce a stored fallback window rather than leaving segment data blank.
- [x] Given candidate windows are stored, then later stages can reuse them without recomputing segment selection logic.

### User stories addressed

- User story 1: Teach short representative bird sounds
- User story 2: Start near the important target vocalization
- User story 3: Prefer target-dominant recordings over messy field context

### Tasks

- [x] **WRITE**: Add persisted segment fields and fallback-reason handling to the candidate records produced by `populate_content.py`.
- [x] **WRITE**: Implement segment selection that prefers BirdNET-backed target-centered 6-8 second windows and falls back to FFmpeg heuristics up to 12 seconds when needed.
- [x] **WRITE**: Ensure candidate previews and downstream consumers reuse stored segment windows instead of recomputing selection logic ad hoc.
- [x] **TEST**: Add focused tests for ideal target-centered windows, longer fallback windows, and missing-BirdNET segment selection behavior.

---

## Issue 5: Admin Mixed Review List With Manual Role Assignment

**Type**: AFK
**Blocked by**: Issues 1-4

### Parent PRD

`audio-curation-pipeline-prd-2026-04-23.md`

### What to build

Redesign the local audio admin so each species is reviewed through a single mixed ranked candidate list, with explicit manual role controls for `none`, `song`, or `call`. Persist these assignments back through the admin API into the unified pool file and show species-level counters for assigned songs and calls.

This slice should replace the current boolean “In app” toggle workflow and the separate Songs / Calls review sections with a role-assignment workflow aligned to the new curation model.

Reference the PRD sections:
- `Solution`
- `Implementation Decisions`
- `Module Design > Audio Admin Review Surface`
- `Module Design > Role Assignment Validator`

### How to verify

- **Manual**:
  1. Start the local admin server.
  2. Open a species with populated candidates.
  3. Confirm the UI shows one mixed ranked list.
  4. Assign one candidate to `song`, another to `call`, and leave others as `none`.
  5. Refresh and confirm the assignments persist.
  6. Confirm species-level counters update immediately.
- **Automated**:
  - Server-side tests verify role assignments are written correctly to the pool file.
  - UI behavior tests, where practical, verify assignment state and counters update correctly.

### Acceptance criteria

- [x] Given a species with unified candidates, when the admin view renders, then it shows one mixed list rather than separate source-defined song and call buckets.
- [x] Given the curator changes a candidate role to `song`, `call`, or `none`, when the change is saved, then the role persists in the pool file.
- [x] Given assignments exist for a species, when the admin sidebar or species header updates, then counters reflect the assigned song and call totals.
- [x] Given a previously assigned candidate is changed to `none`, then the UI and persisted file both reflect the removal of that role.

### User stories addressed

- User story 8: See original XC type metadata as a hint
- User story 9: Manually assign final song/call roles
- User story 22: Show progress counters for assigned songs and calls

### Tasks

- [x] **WRITE**: Refactor `admin/index.html` species rendering from separate Songs / Calls sections into one mixed candidate list ordered by the new ranking data.
- [x] **WRITE**: Replace the boolean “In app” toggle flow in `admin/index.html` and `admin/server.py` with explicit role assignment for `none`, `song`, and `call`.
- [x] **WRITE**: Add species-level assigned-song and assigned-call counters in the admin sidebar and detail view, updating immediately after role changes.
- [x] **TEST**: Add server-side persistence coverage and lightweight UI behavior checks for role assignment, removal, and counter updates.

---

## Issue 6: Admin Evidence And License Badges For Curation Decisions

**Type**: HITL
**Blocked by**: Issues 1-5

### Parent PRD

`audio-curation-pipeline-prd-2026-04-23.md`

### What to build

Add the evidence and labeling layer that supports real curation decisions in the admin UI: clear commercial vs non-commercial badges, concise BirdNET target/overlap summaries, and ranking-support metadata that helps the curator decide which clips to keep.

This slice is HITL because the amount and formatting of evidence shown in the admin is a product decision that should be tuned after reviewing real species output, not just inferred from the PRD.

Reference the PRD sections:
- `Solution`
- `Implementation Decisions`
- `Open Questions`

### How to verify

- **Manual**:
  1. Review several species in the admin UI with real candidate data.
  2. Confirm license status is obvious at a glance.
  3. Confirm BirdNET summaries are informative without overwhelming the card.
  4. Adjust presentation only after curator review of real examples.
- **Automated**:
  - Rendering tests, where practical, verify that commercial/non-commercial badges and BirdNET summary blocks appear when corresponding data exists.

### Acceptance criteria

- [x] Given a candidate is commercial-compatible, when it is shown in the admin, then its license status is clearly distinguished from non-commercial candidates.
- [x] Given BirdNET target and overlap data exist, when a candidate card renders, then the UI surfaces a concise summary that supports role selection.
- [x] Given BirdNET data is missing, when a candidate card renders, then the UI shows an explicit degraded-analysis state rather than implying full analysis was available.
- [x] Given the curator reviews several real species, then the evidence presentation is confirmed to be useful rather than too noisy before the slice is considered complete.

### User stories addressed

- User story 10: See commercial vs non-commercial status in admin
- User story 11: See BirdNET target and overlap signals in admin
- User story 14: Keep the target of two songs and two calls visible during curation

### Tasks

- [x] **WRITE**: Add clear commercial vs non-commercial badges and degraded-analysis markers to candidate cards in `admin/index.html`.
- [x] **WRITE**: Add concise BirdNET evidence summaries and ranking-support metadata to the candidate cards, using the stored analysis fields from the unified schema.
- [x] **REVIEW**: Review the evidence density on real species in the admin UI and decide whether any BirdNET or ranking details should be simplified, collapsed, or expanded.
- [x] **TEST**: Add rendering coverage for license badges, BirdNET summary blocks, and degraded-analysis display states where practical.

### Review notes

- Reviewed American Robin, Steller's Jay, and House Finch in the local admin on `http://localhost:8765` with the checked-in pool data.
- The degraded-analysis presentation was slightly repetitive in the first pass, so the card copy was tightened to keep the explicit badge while shortening the BirdNET body text.
- The checked-in pool currently exercises degraded-analysis states only; BirdNET-assisted summary and ranking-support rendering were verified through the automated rendering tests against unified-schema fixtures.

---

## Issue 7: Export Modes With Commercial Substitution And Summary Warnings

**Type**: AFK
**Blocked by**: Issues 1-6

### Parent PRD

`audio-curation-pipeline-prd-2026-04-23.md`

### What to build

Implement export logic that converts unified curated candidates into final role-based manifest output under explicit license modes. Support `all` mode, which preserves the curator’s selected clips, and `commercial` mode, which automatically substitutes the best commercial-compatible candidate for a role when the selected candidate is non-commercial and logs the substitution.

This slice should also include validator and summary behavior so substitution and missing-role situations are visible to the operator.

Reference the PRD sections:
- `Solution`
- `Implementation Decisions`
- `Module Design > Role Assignment Validator`
- `Module Design > Export Builder`

### How to verify

- **Manual**:
  1. Prepare a species where the selected role uses an NC clip and a weaker commercial-compatible candidate also exists.
  2. Run export in `all` mode and confirm the NC selection is preserved.
  3. Run export in `commercial` mode and confirm the commercial-compatible substitute is used instead.
  4. Confirm the summary output reports the substitution.
- **Automated**:
  - Validator tests verify role counts, sparse-case warnings, and substitution eligibility.
  - Export tests verify `all` and `commercial` modes produce the expected chosen clip for each role.

### Acceptance criteria

- [x] Given curated assignments and `all` mode, when export runs, then the selected clips are preserved regardless of commercial status.
- [x] Given a selected role uses an NC clip and a commercial-compatible alternative exists, when export runs in `commercial` mode, then the best commercial-compatible candidate is substituted automatically.
- [x] Given a substitution occurs, when export completes, then the operator receives a clear warning describing the tradeoff.
- [x] Given no commercial-compatible replacement exists for a selected NC role, when export runs in `commercial` mode, then the output and warnings make that gap explicit rather than silently hiding it.

### User stories addressed

- User story 18: Substitute commercial-compatible clips in commercial mode
- User story 19: Preserve selected NC clips in all mode
- User story 20: Warn when commercial substitution trades quality for licensing

### Tasks

- [x] **WRITE**: Add export-mode handling to the pipeline so `all` preserves curator choices and `commercial` resolves role assignments through best available commercial-compatible substitutes.
- [x] **WRITE**: Implement role validation and substitution-summary reporting for sparse roles, missing replacements, and quality tradeoff warnings.
- [x] **WRITE**: Update any manifest-building helpers so final export resolves from unified candidates and selected roles instead of the old preselected pools.
- [x] **TEST**: Add export and validator tests covering preserved NC output, successful commercial substitution, and explicit warnings when no compliant substitute exists.

---

## Issue 8: Segment-Aware Media Build From Curated Assignments

**Type**: AFK
**Blocked by**: Issues 4, 7

### Parent PRD

`audio-curation-pipeline-prd-2026-04-23.md`

### What to build

Update the media build pipeline so download and normalization operate from curated assignments and their stored segment windows rather than rediscovering segments independently. The built manifest must continue to export role-based `songs` and `calls` arrays for the runtime app, but those arrays should now reflect late manual assignment plus export-mode decisions.

This slice should produce final local audio assets and manifest output consistent with the curated pool and export mode.

Reference the PRD sections:
- `Solution`
- `Implementation Decisions`
- `Module Design > Export Builder`

### How to verify

- **Manual**:
  1. Curate assignments in admin for a few species.
  2. Run the media build in `all` mode and inspect the generated audio files and manifest.
  3. Confirm built clip durations reflect the stored segment windows.
  4. Confirm the manifest still contains `songs` and `calls` arrays the app can load.
- **Automated**:
  - Media-build tests verify selected segment windows are used when present.
  - Manifest-shape tests verify final output still matches the runtime contract.

### Acceptance criteria

- [x] Given curated assignments with stored segment windows, when media build runs, then generated audio files use those windows instead of re-deriving unrelated segments.
- [x] Given final export data, when the manifest is written, then it preserves the runtime contract of `audio_clips.songs` and `audio_clips.calls`.
- [x] Given the build runs in different export modes, then the generated audio files and manifest reflect the resolved selection for that mode.
- [x] Given BirdNET was unavailable upstream, when media build runs, then stored FFmpeg-only fallback windows are still honored.

### User stories addressed

- User story 4: Keep a consistent feel across species
- User story 15: Preserve curated role assignments in the final app manifest
- User story 17: Keep the workflow functioning without BirdNET

### Tasks

- [x] **WRITE**: Update `download_media.py` to consume curated assignments and stored segment windows from the unified pool rather than re-deriving final selections from old `selected` flags.
- [x] **WRITE**: Make the media build honor resolved export-mode choices and emit the runtime `audio_clips.songs` / `audio_clips.calls` manifest shape from curated assignments.
- [x] **WRITE**: Preserve FFmpeg-only fallback windows during media build when BirdNET analysis was unavailable upstream.
- [x] **TEST**: Add focused coverage for segment-aware media selection and final manifest shape compatibility.

---

## Issue 9: Runtime Guardrails For Sparse Song And Call Sets

**Type**: AFK
**Blocked by**: Issue 7

### Parent PRD

`audio-curation-pipeline-prd-2026-04-23.md`

### What to build

Harden the learning and quiz runtime so species with only one song and one call, or otherwise sparse clip sets, still produce a clean user experience. This includes preventing degenerate same-different pairings, keeping role-based playback controls sane with one clip, and preserving quiz generation behavior when role counts are low.

This slice should be implemented against the existing runtime manifest shape so the app remains compatible with the output of Issue 8.

Reference the PRD sections:
- `Solution`
- `Implementation Decisions`
- `Module Design > Runtime Sparse-Clip Guardrails`

### How to verify

- **Manual**:
  1. Load a manifest fixture where some species have only one song and one call.
  2. Exercise Learn and Quiz flows for those species.
  3. Confirm playback, same-different prompts, and repeated-question behavior remain intentional.
- **Automated**:
  - Unit tests verify `selectClip`, quiz building, and lesson/introduction flows behave correctly for sparse roles.
  - Regression tests verify no crash or unusable question is produced when only one clip exists in a role or species.

### Acceptance criteria

- [ ] Given a species has only one curated song and one curated call, when the learner uses Learn mode, then the playback controls still work naturally without odd cycling behavior.
- [ ] Given a species has sparse clips, when same-different quiz items are generated, then the app avoids degenerate comparisons that feel like the same clip repeated as a trick.
- [ ] Given quiz and lesson builders receive low-count manifests, when they choose clips, then they continue to produce valid sessions without crashes.
- [ ] Given the app loads a sparse manifest, then it remains fully usable even if some species do not meet the target two-song/two-call set.

### User stories addressed

- User story 5: Support species with only one curated song and one curated call
- User story 6: Avoid awkward UI states when clip counts are low
- User story 27: Avoid degenerate same-different and replay behavior

### Tasks

- [ ] **WRITE**: Harden `beakspeak/src/core/quiz.ts` clip selection and same-different generation so sparse role sets do not produce degenerate or confusing comparisons.
- [ ] **WRITE**: Review `beakspeak/src/core/lesson.ts` and `beakspeak/src/components/shared/AudioButton.tsx` behavior for one-clip roles so playback and rotation remain intentional.
- [ ] **WRITE**: Add any small runtime guardrails needed in Learn and Quiz flows to keep sparse manifests usable without changing the app’s manifest contract.
- [ ] **TEST**: Extend core and component tests to cover one-song/one-call species, one-total-clip species, and same-different fallback behavior.

---

## Issue 10: End-To-End Curation Smoke Test And Operator Workflow

**Type**: AFK
**Blocked by**: Issues 1-9

### Parent PRD

`audio-curation-pipeline-prd-2026-04-23.md`

### What to build

Create the final end-to-end operator workflow and smoke-test path for the redesigned pipeline: populate candidates, review and assign roles in admin, export in both license modes, build media, and validate that the resulting app assets are usable. This slice should also document the intended operator flow and confirm the system behaves correctly in the weaker/ambiguous-call case and other noisy real-world scenarios.

This is a thin integration slice that verifies the full tracer bullet from raw XC input to final manifest and usable app behavior.

Reference the PRD sections:
- `Solution`
- `Testing Decisions`
- `Further Notes`

### How to verify

- **Manual**:
  1. Run the full content workflow on a small representative subset of species.
  2. Confirm BirdNET-present and BirdNET-absent paths both work.
  3. Curate at least one species that uses a weaker or ambiguous call.
  4. Export both `all` and `commercial` modes and compare results.
  5. Load the generated manifest in the app and confirm the curated species behave as expected.
- **Automated**:
  - Add a narrow smoke test or fixture-driven integration check where feasible to validate the populate-to-export path produces structurally valid output.

### Acceptance criteria

- [ ] Given the redesigned populate, admin, export, and build steps, when an operator runs the full workflow on representative species, then the resulting manifest and media assets are internally consistent and app-usable.
- [ ] Given BirdNET is unavailable, when the full workflow is exercised, then the operator can still complete curation with explicit degraded-analysis warnings.
- [ ] Given a species requires a weaker or ambiguous call, when the curator assigns it, then the system preserves that choice through export and build.
- [ ] Given both `all` and `commercial` export modes are exercised, then the operator can clearly see the practical difference between best-quality and commercial-safe outputs.

### User stories addressed

- User story 13: Allow a weaker or ambiguous call when no clean call exists
- User story 24: Fail noisily but cleanly when BirdNET is misconfigured
- User story 25: Preserve an FFmpeg-only fallback workflow

### Tasks

- [ ] **WRITE**: Document the end-to-end operator workflow in the implementation file or adjacent notes, covering populate, admin review, export mode choice, media build, and app verification.
- [ ] **WRITE**: Run a small representative end-to-end content workflow and capture any required adjustments for weaker/ambiguous call assignments and BirdNET-misconfigured fallback handling.
- [ ] **TEST**: Add or script a narrow smoke check that validates the populate-to-export path produces structurally valid output for a representative subset.
- [ ] **REVIEW**: Confirm on real outputs that the practical difference between `all` and `commercial` modes is understandable and acceptable before considering the full redesign complete.

---
