# PRD: Audio Curation Pipeline Redesign

## Problem Statement

BeakSpeak's current audio pipeline produces a training set that is too inconsistent for the beginner-focused learning experience the app is trying to deliver.

Today, audio selection is driven mostly by Xeno-canto metadata and a lightweight scoring function. The pipeline splits candidates into separate `song` and `call` buckets early, prefers commercial licenses first, and trims clips with a simple silence-based heuristic. That creates several problems:

- Different birds end up with very different audio quality and background cleanliness.
- Some selected clips are longer than needed or bury the target vocalization inside extra context.
- The admin review workflow is organized around the pipeline's early `song`/`call` guess instead of around the curator's final judgment.
- The license policy is partly encoded in selection logic rather than exposed as an explicit export choice.
- The app risks teaching beginners to cope with noisy field conditions before they have learned the core representative sounds of each species.

From the user's perspective, the gap is simple: the app should teach a small, reliable, motivating set of bird sounds that a beginner might actually hear on a common birdwalk, but the current pipeline does not yet produce a clean, consistent set of training clips.

## Solution

When this work is complete, BeakSpeak will produce a more pedagogically consistent audio set centered on short, target-dominant, manually curated exemplars.

The pipeline will gather a unified candidate pool per species, keep Xeno-canto metadata intact, optionally analyze candidates with BirdNET through an external CLI integration, and surface the top mixed candidates in the audio admin for human review. The admin will show all candidate types, licensing status, BirdNET analysis results, and allow the curator to manually assign each clip to `song`, `call`, or neither.

The shipped app will continue to consume a manifest with `songs` and `calls`, but those roles will be assigned late in the pipeline by the curator rather than assumed early from source metadata. The system will target two curated songs and two curated calls per species, while preserving good UX if only one song and one call are ultimately selected.

The pipeline will prioritize target-centered segments of roughly 6-8 seconds, with fallback segments up to 12 seconds when the source material requires more context. BirdNET will remain optional and external to this repository. If BirdNET is unavailable, the pipeline will still run with the existing FFmpeg-only trimming path, but it must emit prominent warnings so the curator understands the analysis gap.

The licensing model will remain explicit rather than binary. The curator can review whether a clip is commercial-compatible or non-commercial in the admin UI. Export will support at least two modes:

- `all`: use the curator-selected clips regardless of commercial status
- `commercial`: automatically substitute the best commercial-compatible clip for a role when the selected clip is non-commercial, and warn when substitution occurs

This design intentionally optimizes for pedagogical consistency over ecological realism for the beginner experience.

## User Stories

1. As a beginner birder, I want the app to teach me short, clear, representative bird sounds, so that I can build confidence quickly on a normal birdwalk.
2. As a beginner birder, I want the clip to start near the important target vocalization, so that I do not waste attention on silence or irrelevant setup.
3. As a beginner birder, I want the app to prefer clean, target-dominant recordings over messy field soundscapes, so that my first exposure is easier to learn from.
4. As a beginner birder, I want the app to keep a consistent feel across species, so that one bird is not taught with a crisp six-second clip while another uses a distant thirty-second recording.
5. As a beginner birder, I want the app to work even when a species only has one curated song and one curated call, so that I still get a usable learning experience for harder species.
6. As a beginner birder, I want the app to avoid breaking or awkward UI states when a species has fewer than the target number of clips, so that missing variety does not degrade the core learning flow.
7. As a content curator, I want to review one mixed pool of top candidate clips per species, so that I can compare all promising options without jumping between separate source-defined buckets.
8. As a content curator, I want to see the original Xeno-canto type metadata for each candidate, so that I can use it as a hint without surrendering role assignment to it.
9. As a content curator, I want to manually assign a candidate to `song`, `call`, or neither, so that the final training role reflects human judgment.
10. As a content curator, I want to see whether a clip is commercial-compatible or non-commercial in the admin UI, so that I can prefer commercial clips when they are good enough.
11. As a content curator, I want BirdNET target and overlap signals shown alongside each clip, so that I can combine automated analysis with my own listening judgment.
12. As a content curator, I want the candidate list to penalize recordings with known background birds in Xeno-canto's `also` metadata, so that obviously noisy clips sink early.
13. As a content curator, I want the pipeline to allow a weaker or more ambiguous call when no clean call exists, so that a species can still be teachable in the app.
14. As a content curator, I want the pipeline to target two songs and two calls per species by default, so that I have a clear curation target without requiring larger sets.
15. As a content curator, I want the final export to preserve the curated role assignments in the app manifest, so that runtime code can stay simple.
16. As a content curator, I want a loud warning when BirdNET is unavailable, so that I do not mistake an FFmpeg-only run for a full analysis run.
17. As a content curator, I want the system to keep running when BirdNET is unavailable, so that I am not blocked from doing manual curation.
18. As a content curator, I want the exported `commercial` mode to automatically substitute a commercial-compatible clip for a non-commercial selected clip when possible, so that I can produce a commercial-safe asset set without re-curating from scratch.
19. As a content curator, I want the exported `all` mode to preserve my selected non-commercial clips, so that I can optimize for best learning quality when licensing flexibility is acceptable.
20. As a content curator, I want a clear warning when a commercial export substitutes a weaker commercial clip, so that I know where quality was traded for licensing.
21. As a content curator, I want the system to preserve enough analysis metadata in the populated pool file, so that admin review does not have to rerun expensive analysis every time.
22. As a content curator, I want the admin to show progress counters for assigned songs and calls, so that I can see whether a species meets the target set.
23. As a pipeline operator, I want BirdNET to be integrated through an environment variable pointing to an external installation, so that this repository does not inherit BirdNET's heavy dependencies.
24. As a pipeline operator, I want the BirdNET wrapper to fail noisily but cleanly when the binary path is wrong or the tool crashes, so that diagnosis is obvious.
25. As a pipeline operator, I want the FFmpeg-only fallback path to remain available, so that the content workflow still functions on machines without BirdNET.
26. As a learner, I want quiz and learn flows to continue working without special cases when clip counts are low, so that content curation changes do not create runtime regressions.
27. As a learner, I want same-different and replay behavior to avoid degenerate comparisons when only one clip exists for a role or species, so that the exercise still feels intentional.
28. As a future maintainer, I want the licensing policy to be a configurable export concern rather than hard-wired into early candidate selection, so that commercial-safe and best-quality builds can coexist.
29. As a future maintainer, I want BirdNET analysis to be optional and encapsulated behind a small interface, so that the rest of the pipeline does not depend on a specific third-party CLI contract.
30. As a future maintainer, I want unresolved edge cases to surface as explicit warnings and summary output, so that bad data does not silently produce a misleading manifest.

## Implementation Decisions

- The product goal is beginner success on common birdwalk species, not exhaustive coverage of all vocal variation. This PRD therefore optimizes for pedagogical consistency over ecological realism.
- The pipeline will stop treating source-provided `song` and `call` categories as the primary internal data model. Instead, it will collect a unified candidate pool per species and defer final role assignment until admin review.
- Xeno-canto `type` metadata will still be stored and displayed, but only as evidence for the curator, not as the authoritative source of final app roles.
- The curated target per species is two songs and two calls. The runtime and export paths must continue to work cleanly if a curator ultimately chooses only one song and one call.
- If a species lacks a clean call after automated analysis and manual review, the curator may assign a weaker or more ambiguous call rather than requiring a perfectly clean exemplar.
- Candidate ranking will combine several signals: Xeno-canto quality and metadata, Xeno-canto `also` background-species hints, BirdNET target evidence, BirdNET overlap evidence, and manual review.
- Xeno-canto `also` metadata is treated as a strong negative signal and should remove obviously multi-species clips early where appropriate, while still allowing the curator to rescue a clip if needed through the manual review workflow.
- BirdNET is an optional external dependency and must not be added as a heavy runtime or install-time dependency of this repository.
- BirdNET will be invoked through an environment-configured executable path. The integration layer must parse BirdNET output into a stable internal analysis structure so the rest of the pipeline does not depend on raw CLI output.
- If BirdNET is unavailable, the pipeline will fall back to FFmpeg-only segment selection. This fallback is acceptable but must be prominently visible in startup logs, per-species status, and final summary output.
- Segment selection will target a target-centered window of 6-8 seconds when analysis supports that choice, with fallback up to 12 seconds when necessary.
- The pipeline must preserve enough per-candidate analysis data in the populated JSON for the admin UI to render decisions without rerunning BirdNET on every page load.
- The admin UI will be redesigned around one mixed candidate list rather than separate source-derived song and call sections.
- The admin UI will allow explicit per-candidate role assignment: `none`, `song`, or `call`. Source metadata can show that a candidate had multiple XC types, but the final app role is singular and curator-assigned.
- The admin UI will continue to surface licensing status and must clearly distinguish commercial-compatible from non-commercial clips.
- Export will support at least two modes: `all` and `commercial`.
- In `all` mode, the export uses the curator-selected clips exactly as assigned.
- In `commercial` mode, if a selected clip is non-commercial and a weaker commercial-compatible clip exists for the same role, export automatically substitutes the best available commercial-compatible clip for that role and reports the substitution.
- The final app manifest will continue to emit `songs` and `calls` arrays so the runtime model remains stable, even if the admin and populated-pool data model becomes more unified.
- The runtime app should be hardened for sparse clip sets. In particular, quiz generation and role-based playback must continue to function without awkward UI or exercise construction when only one clip exists in a role.

## Module Design

### Candidate Pool Builder

- **Name**: Candidate Pool Builder
- **Responsibility**: Fetch and assemble a unified per-species candidate pool from Xeno-canto and existing metadata sources.
- **Interface**: Accepts species identity and pipeline settings; returns a normalized candidate collection with source metadata, licensing fields, and ranking inputs. Failure modes include remote API errors, missing metadata, and partial candidate coverage.
- **Tested**: Yes

### Candidate Scoring Policy

- **Name**: Candidate Scoring Policy
- **Responsibility**: Convert source metadata and analysis results into a ranked order tuned for beginner-oriented teaching quality.
- **Interface**: Accepts a candidate plus scoring context; returns a stable score and explanatory sub-signals. Failure modes include missing analysis fields and incomplete metadata, which must degrade gracefully rather than crash.
- **Tested**: Yes

### BirdNET Adapter

- **Name**: BirdNET Adapter
- **Responsibility**: Invoke the external BirdNET CLI and normalize its output into a stable internal analysis shape.
- **Interface**: Accepts an audio file path and analysis settings; returns target detections, overlap detections, segment proposals, availability status, and structured failure information. Failure modes include missing executable path, command failure, parse errors, and timeouts.
- **Tested**: Yes

### Segment Selection Engine

- **Name**: Segment Selection Engine
- **Responsibility**: Choose the best export window for a candidate clip using BirdNET when available and FFmpeg heuristics otherwise.
- **Interface**: Accepts a candidate plus analysis context; returns segment start, end, duration, confidence, and fallback reason. Failure modes include no suitable target-centered region, unreadable audio, and missing BirdNET analysis.
- **Tested**: Yes

### Curated Audio Pool Schema

- **Name**: Curated Audio Pool Schema
- **Responsibility**: Define the persisted structure for unified candidates, role assignments, analysis metadata, and export-relevant fields.
- **Interface**: Stable fields must include source identity, XC types, selected role, licensing status, ranking data, segment data, and analysis status. Failure modes include backward-compatibility gaps when older pool files are loaded.
- **Tested**: Yes

### Audio Admin Review Surface

- **Name**: Audio Admin Review Surface
- **Responsibility**: Present a mixed candidate list and let the curator inspect, compare, and assign final roles.
- **Interface**: Displays candidate playback, spectrogram, XC metadata, BirdNET summary, license badge, and role controls; persists assignments back to the pool file through the local admin API. Failure modes include missing analysis data, missing local audio files, and invalid assignment state.
- **Tested**: No

### Role Assignment Validator

- **Name**: Role Assignment Validator
- **Responsibility**: Check whether a species meets target curation goals and produce warnings without preventing manual tradeoffs.
- **Interface**: Accepts one species' assigned candidates and export mode; returns counters, warnings, substitution opportunities, and blocking errors if any. Failure modes include duplicate assignments, missing roles, and ambiguous commercial fallback choices.
- **Tested**: Yes

### Export Builder

- **Name**: Export Builder
- **Responsibility**: Convert the curated pool into the final app manifest and downloaded media set for a specific license mode.
- **Interface**: Accepts the curated pool and export mode; returns final role arrays, applied substitutions, and summary output. Failure modes include missing segment data, absent substitute clips, and incompatible pool schema versions.
- **Tested**: Yes

### Runtime Sparse-Clip Guardrails

- **Name**: Runtime Sparse-Clip Guardrails
- **Responsibility**: Ensure the learning and quiz experience remains intentional when a species has very few curated clips.
- **Interface**: Existing runtime selection flows continue to consume manifest songs and calls, but must handle one-clip and low-clip cases safely. Failure modes include duplicate-comparison exercises and confusing replay rotation behavior.
- **Tested**: Yes

## Testing Decisions

- Good tests should verify observable behavior of the pipeline and app rather than internal implementation details.
- The candidate pool builder should be tested with representative Xeno-canto payloads covering clean clips, clips with `also` metadata, mixed XC types, non-commercial licenses, and sparse species.
- The scoring policy should be tested with explicit fixtures so that target-confidence, overlap penalties, licensing signals, and XC metadata produce stable rankings.
- The BirdNET adapter should be tested with fixture outputs from the external CLI so parser behavior is deterministic without requiring BirdNET to run in unit tests.
- The segment selection engine should be tested with analysis fixtures covering ideal 6-8 second windows, longer fallback windows, missing BirdNET availability, and total fallback to FFmpeg heuristics.
- The schema layer should be tested for backward compatibility with older populated pool files and for round-trip persistence of role assignments and analysis metadata.
- The validator should be tested for the target `2 song / 2 call` case, the acceptable `1 song / 1 call` sparse case, duplicate-role conflicts, and commercial substitution opportunities.
- The export builder should be tested in both `all` and `commercial` modes, including substitution behavior where the curator-selected role is non-commercial but a weaker commercial-compatible replacement exists.
- The admin UI should be tested at the behavior level where practical: mixed list rendering, role assignment persistence, counters, and warning presentation. Heavy visual details can remain manual if the local-only tool does not already have a strong test harness.
- Runtime tests should cover low-count species so quiz and learn flows continue to function when only one clip exists for a role or for the species overall.
- Prior art in the codebase includes the existing pure-logic tests around quiz, lesson construction, manifest loading, and audio behavior. Those should guide the style of new tests for ranking, validation, export, and sparse-clip runtime rules.

## Out of Scope

- Adding BirdNET or its machine-learning dependencies directly to this repository as install-time dependencies.
- Redesigning the deployed app UI around a unified clip model. The app manifest remains role-based with `songs` and `calls`.
- Teaching ecological realism as a primary goal in this phase, such as intentionally preserving messy field soundscapes, rich variation, or many alternates per role.
- Shipping more than the target compact training set as part of this redesign. This work is about cleaner curation, not expanding scope into advanced-mode content libraries.
- Supporting multiple final roles for a single exported clip in the app manifest. A curator may inspect clips with mixed XC types, but exported assignments remain singular per role.
- Solving every long-tail species gap perfectly. Some species may still require weaker or more ambiguous calls when the source material is poor.
- Reworking the full learn or quiz pedagogy beyond the guardrails needed to tolerate sparse clip sets.
- Building a cloud service, background worker, or remote orchestration system for media analysis. This remains a local content workflow.

## Open Questions

1. **What should happen when a species still has no plausible candidate for a role even after allowing weaker or ambiguous assignments?**
   Owner: Product / curator
   Suggested resolution: Decide whether export should omit the role with a loud warning, block export for that species, or allow a same-role substitute as a temporary fallback.

2. **How much BirdNET evidence should be exposed in the admin UI before it becomes noisy rather than helpful?**
   Owner: Product / curator
   Suggested resolution: Start with a concise summary plus expandable details, then refine after using the tool on several species.

3. **How should the system rank multiple candidate commercial substitutions when all of them are materially worse than the selected non-commercial clip?**
   Owner: Product / curator
   Suggested resolution: Start with highest pipeline score among commercial-compatible candidates and include substitution warnings in export output; revisit if this produces unsatisfactory commercial builds.

4. **Should the runtime same-different flow avoid pairing a song and call from the same species when only highly ambiguous assignments exist?**
   Owner: Product / curator
   Suggested resolution: Review once the first curated sparse species are available and adjust runtime guardrails only if the exercise feels misleading.

## Further Notes

- This PRD intentionally separates three concerns that are partially entangled in the current pipeline: candidate gathering, candidate analysis, and final export policy. That separation is the main architectural move.
- The late-binding role assignment model is the deepest change in the design. It allows the system to keep source metadata intact while still optimizing the final training set for human judgment.
- The licensing decision is not simply "allow NC" versus "reject NC." The better model is to retain license information everywhere, let the curator see it during review, and make the final export mode explicit.
- BirdNET is valuable here primarily as a reranking and segment-proposal tool. It should not be treated as an infallible binary judge of whether a recording is usable.
- The desired clip length is intentionally narrower than the current default. The system should bias toward concise, target-centered exemplars because the product goal is beginner learning efficiency, not archival completeness.
- The current runtime already tolerates low clip counts reasonably well, but this redesign should formalize that tolerance as an explicit requirement rather than leaving it accidental.
