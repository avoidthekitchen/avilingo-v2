# Implementation Issues: Non-Destructive App Audio Trim Export

Parent PRD: `rpi/plans/export-to-app-nondestructive-audio-trim-prd-2026-04-24-1337.md`

Generated: 2026-04-24 13:59 America/Los_Angeles

## Final Scope Decisions

- Current admin previews are sufficient for the first version.
- Manual trims are trims within `beakspeak/public/content/audio/{species}/{xc_id}.ogg`, not the original Xeno-canto source file.
- `export_app_audio.py` must read existing local app audio as its source for trimmed exports.
- The minimal version must not consult or download original Xeno-canto audio.
- Trimmed app audio must be written under a `trimmed` folder so the existing pre-trim normalized/exported clip is preserved.
- If the local source app audio file does not exist, `export_app_audio.py` must fail with a clear error telling the user to redownload the source audio.
- Admin trim controls render only for selected clips initially.
- Reset sets `candidate.segment.status` to `not_set` and clears segment times.
- Force regeneration is explicit with `--force-audio`.
- If manual trim metadata exists but a trimmed output is skipped because `--force-audio` was not provided, export prints a warning.
- Admin should allow playing the selected segment.

## Proposed Breakdown

1. **Persist manual trims from selected admin clips**: AFK, unblocked, covers save/validation/reload path.
2. **Reset trims and play selected segment in admin**: AFK, blocked by Issue 1, covers reset and preview loop.
3. **Export trimmed clips to preserved-output folder**: AFK, blocked by Issue 1, creates `export_app_audio.py` and trim generation path.
4. **Generate trim-aware app manifest references**: AFK, blocked by Issue 3, makes BeakSpeak consume trimmed assets only when manual trims exist.
5. **Handle missing source files and skipped stale trims clearly**: AFK, blocked by Issue 3, adds failure/warning behavior and tests.
6. **Wire docs and command guidance for the new workflow**: AFK, blocked by Issues 1-5, makes the workflow discoverable.

---

## Issue 1: Persist Manual Trims From Selected Admin Clips

**Type**: AFK
**Blocked by**: None — can start immediately

### Parent PRD

`export-to-app-nondestructive-audio-trim-prd-2026-04-24-1337.md`

### What to build

Add the first vertical slice for manual trim persistence. Selected clip cards in the admin panel should show simple numeric start/end controls. Saving those controls should persist a manual `candidate.segment` on the matching candidate record. The backend should validate structural correctness before saving. Existing BirdNET metadata, selected role, and audio URL metadata must remain unchanged.

Trim controls should only appear when `selected_role` is `song` or `call`. Non-selected candidates should keep the current role-selection experience without trim controls.

### How to verify

- **Manual**: Start the admin server, select a clip as `song` or `call`, enter a valid start/end trim, save it, reload the admin page, and confirm the trim values are still visible on that selected clip.
- **Manual**: Confirm non-selected clips do not show trim controls.
- **Manual**: Confirm saving a trim does not change the selected role or BirdNET evidence shown for the clip.
- **Automated**: Test that the segment persistence endpoint saves `status: "manual"`, `start_s`, `end_s`, and `duration_s` for the correct candidate.
- **Automated**: Test that invalid structural payloads are rejected and do not mutate the candidate record.

### Acceptance criteria

- [x] Given a selected clip, when the curator saves a valid start/end trim, then the matching candidate stores a manual segment with computed duration.
- [x] Given a non-selected clip, when the admin renders the clip card, then trim controls are not shown.
- [x] Given invalid trim input such as non-numeric values or `start_s >= end_s`, when the curator saves, then the server rejects the request and preserves the previous candidate state.
- [x] Given a saved trim, when the admin page reloads, then the saved start/end values are displayed for that selected clip.
- [x] Given a trim save, then existing `candidate.analysis`, `selected_role`, and candidate identity fields are preserved.

### User stories addressed

- User story 1: Trim silence from selected clips.
- User story 5: Show saved trim fields after reload.
- User story 7: Reject invalid trim values.

---

## Issue 2: Reset Trims And Play Selected Segment In Admin

**Type**: AFK
**Blocked by**: Issue 1

### Parent PRD

`export-to-app-nondestructive-audio-trim-prd-2026-04-24-1337.md`

### What to build

Complete the admin trim editing loop by adding reset and selected-segment playback. Reset should set the candidate segment back to `not_set` and clear segment times. Playing the selected segment should use the existing admin audio preview, seek to the saved or currently entered start time, and stop at the end time.

The admin UX should warn when the entered segment is shorter than 1 second or longer than 20 seconds, but it should not hard-block those values if the segment is otherwise structurally valid.

### How to verify

- **Manual**: Save a trim, click reset, reload the admin page, and confirm the trim is cleared.
- **Manual**: Enter a segment, click play selected segment, and confirm playback starts near the segment start and stops near the segment end.
- **Manual**: Enter a segment shorter than 1 second and confirm the admin shows a warning but still allows save.
- **Manual**: Enter a segment longer than 20 seconds and confirm the admin shows a warning but still allows save.
- **Automated**: Test reset persistence clears segment status/times.
- **Automated**: Test duration-warning state for under-1-second and over-20-second segments if the admin state logic is testable outside browser E2E.

### Acceptance criteria

- [x] Given a selected clip with a manual trim, when the curator resets it, then the candidate segment becomes `not_set` and segment times are cleared.
- [x] Given a selected clip with a start/end trim, when the curator plays the selected segment, then playback seeks to the start and stops at the end.
- [x] Given a segment shorter than 1 second, then the admin warns but does not hard-block save.
- [x] Given a segment longer than 20 seconds, then the admin warns but does not hard-block save.

### User stories addressed

- User story 6: Reset a manual trim.
- User story 1: Trim and preview the useful vocalization.
- User story 7: Handle validation and edge cases predictably.

---

## Issue 3: Export Trimmed Clips To Preserved-Output Folder

**Type**: AFK
**Blocked by**: Issue 1

### Parent PRD

`export-to-app-nondestructive-audio-trim-prd-2026-04-24-1337.md`

### What to build

Create `export_app_audio.py` as the explicit app-audio export command for manual trims. For candidates with manual segment metadata, the command should read the existing normalized app audio from `beakspeak/public/content/audio/{species}/{xc_id}.ogg`, apply the manual trim window, normalize/encode the trimmed result as needed, and write the generated output under a `trimmed` folder.

The command must preserve the pre-trim source app audio. It must not overwrite `beakspeak/public/content/audio/{species}/{xc_id}.ogg` while creating a trimmed result. It must not consult or download original Xeno-canto audio.

A safe implementation should write to a temporary file first, then replace the trimmed output only after FFmpeg succeeds.

### How to verify

- **Manual**: Save a manual trim for a selected clip, run `export_app_audio.py --force-audio`, and confirm a trimmed `.ogg` appears under the species `trimmed` folder.
- **Manual**: Confirm the original pre-trim `.ogg` still exists and is unchanged.
- **Manual**: Listen to the trimmed output and confirm it corresponds to the saved start/end window.
- **Automated**: Test that manual segment metadata causes export to invoke FFmpeg with the expected trim window using the existing local app audio file as input.
- **Automated**: Test that the source and destination paths are different and the original file is not overwritten.

### Acceptance criteria

- [x] Given a selected clip with manual segment metadata and existing local app audio, when `export_app_audio.py --force-audio` runs, then a trimmed app audio file is written under a `trimmed` folder.
- [x] Given a manual trim export, then the pre-trim local app audio file remains in place.
- [x] Given a manual trim export, then the command does not request or download original Xeno-canto audio.
- [x] Given FFmpeg failure, then no partial trimmed output replaces a previously valid trimmed file.

### User stories addressed

- User story 8: Exported app audio updates after trim changes.
- User story 12: Original candidate audio is treated as source material.
- User story 13: App audio is generated output.

---

## Issue 4: Generate Trim-Aware App Manifest References

**Type**: AFK
**Blocked by**: Issue 3

### Parent PRD

`export-to-app-nondestructive-audio-trim-prd-2026-04-24-1337.md`

### What to build

Extend the app export command so the BeakSpeak app consumes trimmed audio only for candidates with manual trims. Untrimmed selected clips should continue to use the current selected-audio behavior and existing app audio URL. Manually trimmed clips should reference the generated file under the `trimmed` folder in the app manifest.

This slice should preserve commercial export behavior: export mode determines which selected clips appear in the manifest, while manual trim metadata determines which generated audio path those selected clips use.

### How to verify

- **Manual**: Save a manual trim, run app export, inspect `manifest.json`, and confirm that clipped candidate references the `trimmed` audio URL.
- **Manual**: Confirm a selected clip without manual trim still references the normal app audio URL.
- **Manual**: Build or run the app and confirm the manually trimmed clip plays through the normal app audio path.
- **Automated**: Test manifest generation for one manual-trimmed selected clip and one untrimmed selected clip.
- **Automated**: Test commercial export mode still filters/substitutes selected clips according to existing behavior.

### Acceptance criteria

- [x] Given a selected clip with manual trim metadata, when app export writes the manifest, then the clip audio URL points to the trimmed generated file.
- [x] Given a selected clip without manual trim metadata, when app export writes the manifest, then the clip uses the current normal app audio URL behavior.
- [x] Given commercial export mode, when app export runs, then existing commercial selection behavior is preserved while trim-aware URLs are still applied.
- [x] Given the app loads the generated manifest, then it can play trimmed and untrimmed selected clips without runtime trimming.

### User stories addressed

- User story 10: App loads short normalized audio.
- User story 11: Player does not download full candidate recordings.
- User story 19: Commercial export rules continue applying.

---

## Issue 5: Handle Missing Source Files And Skipped Stale Trims Clearly

**Type**: AFK
**Blocked by**: Issue 3

### Parent PRD

`export-to-app-nondestructive-audio-trim-prd-2026-04-24-1337.md`

### What to build

Add clear operational failure and warning behavior to `export_app_audio.py`. If a candidate has manual trim metadata but the expected existing local app audio file is missing, the command should fail with a clear error telling the user to redownload the source audio. It should not fall back to Xeno-canto download.

If manual trim metadata exists and a trimmed output already exists, but `--force-audio` is not provided, the command should skip regeneration and print a warning that the existing trimmed output may be stale.

### How to verify

- **Manual**: Temporarily move a source app audio file for a manually trimmed candidate, run export, and confirm the command fails with a clear redownload-source-audio message.
- **Manual**: Create a manual trim, ensure a trimmed output exists, change the trim metadata, run export without `--force-audio`, and confirm a stale-skip warning is printed.
- **Automated**: Test missing local source app audio returns a non-zero failure and clear error message.
- **Automated**: Test manual trim plus existing trimmed output without `--force-audio` prints a warning and does not regenerate.

### Acceptance criteria

- [x] Given manual trim metadata and a missing local source app audio file, when export runs, then it fails clearly and tells the user to redownload the source audio.
- [x] Given manual trim metadata and an existing trimmed output, when export runs without `--force-audio`, then it skips regeneration and prints a stale-output warning.
- [x] Given the same state with `--force-audio`, when export runs, then it regenerates the trimmed output.
- [x] Given a missing local source file, then export does not consult or download original Xeno-canto audio.

### User stories addressed

- User story 16: Force/regenerate mode updates existing app assets.
- User story 17: Export skips unchanged work when safe.
- User story 18: Failed source audio reads produce explicit errors.

---

## Issue 6: Document The New Trim Export Workflow

**Type**: AFK
**Blocked by**: Issue 1, Issue 2, Issue 3, Issue 4, Issue 5

### Parent PRD

`export-to-app-nondestructive-audio-trim-prd-2026-04-24-1337.md`

### What to build

Update project documentation and command guidance so the new workflow is discoverable. The documentation should explain that admin trims are metadata, that source app audio is preserved, that trimmed app audio is generated under a `trimmed` folder, and that `export_app_audio.py --force-audio` is required to regenerate existing trimmed outputs after changing trims.

This issue should also document the failure mode for missing local app audio: the user should rerun the existing media download/normalization step to restore source app audio before exporting trims.

### How to verify

- **Manual**: Read the updated docs and follow the documented path from saving a trim in admin to regenerating trimmed app audio and loading the app manifest.
- **Manual**: Confirm the docs make it clear that original Xeno-canto audio is not downloaded by the minimal trim export path.
- **Automated**: Run any docs-adjacent command examples that are practical and cheap, such as command help output if `export_app_audio.py --help` is implemented.

### Acceptance criteria

- [x] Given a new maintainer, when they read the docs, then they can identify the difference between existing app source audio and trimmed generated app audio.
- [x] Given a curator changes a trim, when they read the docs, then they know to run `export_app_audio.py --force-audio` to regenerate trimmed output.
- [x] Given export fails because local app audio is missing, when the user reads the docs, then they know which existing source-audio regeneration step to run.
- [x] Given the minimal scope, then the docs state that full Xeno-canto source downloads and BirdNET re-analysis are out of scope.

### User stories addressed

- User story 14: Separate app export from source download conceptually.
- User story 20: Tests and workflow prevent accidental destructive behavior.
- User story 25: Generated app assets are replaceable.

---
