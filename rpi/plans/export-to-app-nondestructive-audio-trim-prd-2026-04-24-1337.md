# PRD: Non-Destructive Audio Trim Export To App

## Problem Statement

The current audio pipeline mixes two responsibilities: obtaining candidate audio for curation and producing normalized audio assets for the BeakSpeak app. This makes manual trimming feel risky because it is not obvious whether a trim will alter the original audio, overwrite useful source material, or only affect generated app assets.

The immediate user need is narrower than a full audio-pipeline redesign. The currently selected clips and existing BirdNET Analyzer metadata are mostly useful. The missing capability is a safe way to manually remove silence before and after the useful vocalization so the BeakSpeak app plays tighter clips.

The user needs confidence that admin trimming is reversible and non-destructive. A trim should be stored as metadata and applied only during app export. Original candidate audio and existing BirdNET metadata should remain available for review and future decisions.

## Solution

Create a clear non-destructive export boundary.

Admin audio trimming will save start/end metadata on the selected candidate. It will not edit or overwrite original candidate audio. A dedicated app-export step will read the selected candidates, apply any manual trim metadata, normalize the resulting audio, and write generated assets for the BeakSpeak app.

If a selected clip has no manual trim, export uses the current selected-audio behavior. If a selected clip has a manual trim, export generates the app asset from that selected time window. The BeakSpeak app consumes only generated app assets. It does not trim audio at runtime and does not directly mutate or depend on admin source audio.

The export process should be explicit enough that future maintainers can reason about what is source material, what is metadata, and what is generated app output.

## User Stories

1. As a curator, I want to trim silence from a selected clip, so that the BeakSpeak app plays only the useful bird vocalization.
2. As a curator, I want trimming to be reversible, so that I can recover from a bad trim without losing the original audio.
3. As a curator, I want trimming to preserve existing BirdNET metadata, so that I can continue using target and overlap species evidence during review.
4. As a curator, I want untrimmed selected clips to continue exporting as they do today, so that I do not need to manually edit every clip.
5. As a curator, I want manual trim fields to show the saved start and end values after reload, so that I can trust that my edits persisted.
6. As a curator, I want to reset a manual trim, so that the selected clip returns to automatic or current default export behavior.
7. As a curator, I want invalid trim values to be rejected, so that bad metadata does not break export.
8. As a curator, I want exported app audio to update after I change a trim, so that the app does not keep playing stale generated files.
9. As a curator, I want clear status when an export asset is stale or regenerated, so that I can verify my trim took effect.
10. As a player, I want BeakSpeak lessons and quizzes to load short normalized audio, so that practice feels fast and focused.
11. As a player, I should not download full candidate recordings, so that app load time and bandwidth stay low.
12. As a maintainer, I want original candidate audio to be treated as source material, so that pipeline changes never destructively alter it.
13. As a maintainer, I want app audio to be treated as generated output, so that it can be safely regenerated from source material and metadata.
14. As a maintainer, I want app export to be a separate conceptual step from source download, so that destructive/non-destructive behavior is obvious.
15. As a maintainer, I want export behavior to be deterministic from candidate metadata, so that repeated exports produce predictable app assets.
16. As a maintainer, I want export to support a force/regenerate mode, so that changed trim metadata can update existing app assets.
17. As a maintainer, I want export to skip unchanged work when safe, so that routine exports do not take longer than necessary.
18. As a maintainer, I want failed source audio reads or downloads to produce explicit errors, so that missing app audio is not silently shipped.
19. As a maintainer, I want commercial export rules to continue applying at export time, so that app assets respect the requested deployment mode.
20. As a maintainer, I want tests around trim persistence and export selection behavior, so that future pipeline edits do not accidentally make trimming destructive.
21. As a maintainer, I want the design to leave room for later source-audio preview and bounded BirdNET analysis, so that this minimal version does not block future improvements.
22. As a maintainer, I want manual segment metadata to survive future content-population runs, so that curator work is not lost when candidate metadata is refreshed.
23. As a maintainer, I want app export to prefer manual trim metadata when present, so that curator intent beats automatic heuristics.
24. As a maintainer, I want app export to fall back safely when no manual trim is present, so that existing clips remain usable without new admin work.
25. As a maintainer, I want generated app assets to be replaceable, so that a bad export can be fixed by correcting metadata and exporting again.

## Implementation Decisions

- Manual trimming is metadata-only. It records a segment window on the candidate record and never edits original candidate audio in place.
- The existing candidate segment concept remains the source of truth for final app trim windows.
- Segment status should distinguish manual curator edits from automatic or unset segments.
- Existing BirdNET analysis metadata should not be recalculated or discarded as part of manual trim export.
- App export should be a distinct module or command from source acquisition, even if some shared helper functions remain.
- The new app-export command should be named `export_app_audio.py`.
- The app-export step reads selected candidates, resolves the appropriate source audio, applies manual trim metadata when present, normalizes audio, and writes generated app assets.
- The BeakSpeak app should continue consuming local generated assets rather than remote original URLs.
- The minimal version should trim the audio clips already available in the current admin workflow. It should not download completely full-length Xeno-canto source recordings.
- Current admin previews are sufficient for the first implementation. Full original source-audio preview is not required.
- If no manual trim exists, export should preserve current selected-audio behavior rather than requiring every selected clip to be trimmed.
- If manual trim exists, export should use that manual window and regenerate the app asset from source audio or equivalent cached source material.
- Existing generated app assets must not be treated as authoritative source material for future trims. They are outputs, not originals.
- Export needs a simple regeneration mechanism so a saved trim does not leave stale app audio in place.
- The first implementation should use explicit force regeneration for correctness. Fingerprint-based skipping can be added later if export time becomes painful.
- Force regeneration should require an explicit `--force-audio` flag.
- If a candidate has manual trim metadata and an existing app audio output is skipped because `--force-audio` was not provided, the export command should print a warning.
- Admin segment editing should start with simple numeric start/end controls and reset behavior. Rich waveform or spectrogram handles are out of scope for the minimal version.
- Admin trim controls should appear only for selected clips initially.
- Resetting a manual trim should set the segment back to `not_set` and clear segment times unless prior auto-segment preservation is implemented separately later.
- Server-side validation must reject structurally invalid segment windows before writing metadata, such as non-numeric values or start values greater than or equal to end values.
- The admin UX should warn, but not hard-block, when a segment is shorter than 1 second or longer than 20 seconds.
- Manual segment edits should follow the same persistence pattern as current role assignment: update the candidate in the pool data and save immediately.
- Future content-population runs should preserve manual segments the same way they preserve other curator decisions.
- Commercial export mode should affect what app assets are emitted, not whether source material or trim metadata exists.
- The design should be compatible with a future source-audio cache and future bounded BirdNET analysis, but neither is required for the minimal trim-export feature.
- If a cache is needed later, use an ignored local cache outside deployed app assets. Do not block the minimal manual-trim feature on finalizing that cache layout.

## Module Design

- **Name**: Segment Persistence
- **Responsibility**: Save, validate, reset, and reload manual candidate segment metadata.
- **Interface**: Accepts candidate identity and either a valid start/end segment or a reset request. Reset sets the segment to `not_set` and clears segment times. Returns the updated segment state or a validation/not-found error.
- **Tested**: yes

- **Name**: Admin Segment Controls
- **Responsibility**: Let curators view, edit, save, and reset the export segment for a selected candidate.
- **Interface**: Renders only for selected clips. Reads current segment metadata from candidate data, sends update/reset requests, and updates local UI state after successful persistence. Handles validation errors without corrupting local state.
- **Tested**: yes, at least for state/persistence behavior where practical

- **Name**: App Audio Exporter
- **Responsibility**: Generate BeakSpeak app audio assets from selected candidates without modifying source audio.
- **Interface**: Exposed as `export_app_audio.py`. Takes export mode and regeneration options, including explicit `--force-audio`. Reads selected candidates, resolves source audio, chooses manual segment or fallback behavior, writes normalized app assets, and reports successes/failures/stale updates.
- **Tested**: yes

- **Name**: Source Audio Resolver
- **Responsibility**: Provide the exporter with readable original or equivalent source audio for a candidate.
- **Interface**: Accepts candidate metadata and returns a local readable audio path or a recoverable error. It may download to a temporary or cache location, but must not overwrite generated app assets as if they were source.
- **Tested**: yes

- **Name**: Export Freshness Policy
- **Responsibility**: Decide whether an existing generated app asset can be reused or must be regenerated.
- **Interface**: Accepts candidate metadata, current segment state, export options, and existing output metadata if available. Returns regenerate or skip. The initial interface can be simple force-or-skip behavior, with warnings when manual trims exist but existing outputs are skipped without `--force-audio`.
- **Tested**: yes

- **Name**: Manifest Builder Integration
- **Responsibility**: Ensure the generated app manifest references the correct exported app audio assets after trim-aware export.
- **Interface**: Accepts selected/exported candidate data and produces manifest audio references consistent with generated files and export mode.
- **Tested**: yes

## Testing Decisions

- Test external behavior rather than implementation details: a manual segment saved in admin should result in app export using that segment, without altering source audio metadata.
- Add persistence tests for valid segment save, invalid segment rejection, candidate not found, and reset behavior.
- Add export tests for three paths: no manual segment uses current fallback behavior, manual segment uses the specified window, and force regeneration updates an existing app asset.
- Add an export test that a manual trim with an existing output prints a warning when skipped without `--force-audio`.
- Add a test that generated app assets are treated as outputs and not as source records that overwrite candidate audio metadata.
- Add a test that manual segment metadata survives normalization of candidate records and reuse from prior pool data.
- Add a manifest/export test confirming selected candidates still resolve to generated app asset URLs after export.
- Use existing admin role-assignment persistence tests or patterns as reference for segment persistence tests.
- Use existing content-pipeline tests around candidate normalization, export audio selection, and segment preservation as reference where available.
- Do not add end-to-end browser tests for the first PR unless the UI behavior becomes complex enough that unit-level confidence is insufficient.

## Out of Scope

- Running BirdNET Analyzer again.
- Adding bounded BirdNET analysis windows.
- Adding multiple analysis windows per candidate.
- Adding full source-audio review to the admin panel.
- Downloading completely full-length Xeno-canto source audio for all candidates.
- Adding waveform or spectrogram drag handles.
- Adding interactive `Analyze selected range` behavior.
- Redesigning ranking, candidate discovery, or role assignment.
- Changing spaced repetition, lesson generation, quiz behavior, or React app playback logic beyond consuming generated assets.
- Implementing a complex export fingerprint system in the first version.
- Moving all media pipeline responsibilities into a new architecture in one step.
- Making the deployed app reference remote Xeno-canto URLs directly.
- Committing source audio cache files to the repository.

## Open Questions

- None for the minimal version. Prior open questions have been resolved into implementation decisions.

## Further Notes

The core principle is that manual trim is an instruction for export, not an edit to the recording. Original candidate audio should remain recoverable from source metadata or a local source cache. Generated app audio should be disposable and reproducible.

This PRD intentionally scopes back from a broader source-audio plus bounded-BirdNET redesign. That broader design remains useful, but the minimal safe path is to make trim metadata explicit, make app export consume that metadata, and make regeneration obvious.

A future phase can introduce full source-audio preview, bounded FFmpeg-selected BirdNET analysis windows, and richer timeline overlays. Those features should build on the same separation: source audio for review, metadata for decisions, generated audio for the app.
