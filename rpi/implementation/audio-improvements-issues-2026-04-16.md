# Audio Improvements — Issues

Parent PRD: `rpi/plans/audio-improvements-prd-2026-04-15.md`

Dependency graph:

```
Issue 1 (state fix) ──> Issue 2 (progress/seek) ──┐
                                                    ├──> Issue 5 (BirdCard integration)
Issue 3 (spectrogram compute) ──> Issue 4 (canvas) ┘

Issue 6 (license + quality) ──┐
                               ├──> Issue 8 (pipeline re-run)
Issue 7 (smart trimming) ─────┘
```

Issues 1, 3, 6, and 7 can start in parallel.

---

## Issue 1: Fix audio state coordination (AudioPlayer + AudioButton)

**Type**: AFK
**Blocked by**: None — can start immediately

### Parent PRD

`rpi/plans/audio-improvements-prd-2026-04-15.md`

### What to build

End-to-end fix for the bug where multiple AudioButton instances show incorrect playing/loading state when the user rapidly switches between clips.

In the AudioPlayer (`adapters/audio.ts`):
- Track the currently active URL internally. Expose it via `getActiveUrl(): string | null`.
- Route audio output through a `GainNode` so that `stop()` can apply a ~100ms linear fade-out ramp before disconnecting the source, rather than an abrupt cut. This provides the brief fade transition described in the PRD's "Fade-Out on Stop" section.
- Ensure `play()` still calls `stop()` before starting a new clip (existing behavior), so the fade applies when switching.

In AudioButton (`components/shared/AudioButton.tsx`):
- Remove the local `audioState` / `onStateChange` subscription pattern that causes the bug.
- Instead, subscribe to the player's state and compare `getActiveUrl()` against the button's own clip URLs to decide whether to show playing/loading/idle.
- Preserve existing behavior: toggle play/stop on tap, cycle to the next clip on completion, track last-played clip per species.

In LearnSession: no changes needed — it already calls `audioPlayer.stop()` on swipe, which continues to work.

### How to verify

- **Manual**: Open a BirdCard with both song and call clips. Tap "Play Song", then immediately tap "Play Call". Verify: Song button shows idle, Call button shows playing, audio is the call clip, and there is a brief fade (no click/pop) during the switch.
- **Automated**: Unit tests on AudioPlayer:
  - `play(urlA)` then `play(urlB)`: `getActiveUrl()` returns `urlB`, state is `'playing'`
  - `stop()`: `getActiveUrl()` returns `null`, state is `'idle'`
  - `play(urlA)` then `stop()`: state transitions through `'playing'` → `'idle'`

### Acceptance criteria

- [ ] Given two AudioButtons on the same BirdCard, when the user taps one while the other is playing, then only the newly tapped button shows as playing and the previous button shows idle
- [ ] Given audio is playing, when `stop()` is called, then audio fades out over ~100ms rather than cutting abruptly
- [ ] Given audio is playing, when `play()` is called with a different URL, then `getActiveUrl()` returns the new URL
- [ ] Given no audio is playing, when `getActiveUrl()` is called, then it returns `null`
- [ ] Given a user swipes between BirdCards in LearnSession, when audio is playing, then audio stops and the button on the previous card does not remain in a playing state

### User stories addressed

- User story 1: Only one audio clip playing at a time
- User story 2: Previous button immediately shows idle when switching clips
- User story 3: Brief visual fade when switching between clips
- User story 20: Audio stops immediately on swipe between BirdCards

### Tasks

#### 1.1. Add GainNode, activeUrl tracking, fade-out to WebAudioPlayer

**Type**: WRITE
**Output**: `audio.ts` has GainNode routing, `getActiveUrl()`, fade-out `stop()`
**Depends on**: none

- [x] Modify `adapters/audio.ts`. Add a private `activeUrl: string | null` field and expose it via `getActiveUrl()` on both the `AudioPlayer` interface and `WebAudioPlayer` class. Create a persistent `GainNode` in the audio routing chain (source → gain → destination) so that `stop()` can ramp gain to 0 over ~100ms via `GainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1)` before disconnecting the source. In `play()`, reset gain to 1 before starting the new source and set `activeUrl` to the URL. In `stop()` and in the `onended` callback, set `activeUrl` to `null`. Ensure `play()` still calls `stop()` first so the fade applies when switching clips.

---

#### 1.2. Unit tests for AudioPlayer state coordination

**Type**: TEST
**Output**: `adapters/audio.test.ts` passes
**Depends on**: 1.1

- [x] Create `adapters/audio.test.ts`. Follow the existing test pattern in `core/manifest.test.ts` (vitest `describe`/`it` blocks). Mock `AudioContext`, `AudioBuffer`, and `AudioBufferSourceNode` since tests run in jsdom. Test: `play(urlA)` → `getActiveUrl()` returns `urlA` and state is `'playing'`. Test: `play(urlA)` then `play(urlB)` → `getActiveUrl()` returns `urlB`. Test: `stop()` → `getActiveUrl()` returns `null` and state is `'idle'`. Test: state transitions follow `idle → loading → playing → idle` sequence.

---

#### 1.3. Refactor AudioButton to use centralized active URL state

**Type**: WRITE
**Output**: Two AudioButtons on the same BirdCard correctly show only the active one as playing
**Depends on**: 1.1

- [x] Modify `components/shared/AudioButton.tsx`. Remove the local `audioState` useState and `unsubRef`-based `onStateChange` subscription pattern that causes the state confusion bug. Instead, subscribe to the player's `onStateChange` but derive the display state by comparing `audioPlayer.getActiveUrl()` against the button's own clip URLs — if the active URL matches one of this button's clips, show the player's current state; otherwise show `'idle'`. Preserve all existing behavior: toggle play/stop on tap, cycle to the next clip on completion via the clip index, and track last-played clip per species via `setLastPlayedClip`.

---

## Issue 2: Add progress tracking and seeking to AudioPlayer

**Type**: AFK
**Blocked by**: Issue 1

### Parent PRD

`rpi/plans/audio-improvements-prd-2026-04-15.md`

### What to build

Extend the AudioPlayer to support playback progress reporting and seeking, as described in the PRD's "Seeking via Web Audio API" section. These are the foundational capabilities that the spectrogram UI (Issue 5) will consume.

Changes to AudioPlayer (`adapters/audio.ts`):
- Extend `play(url: string, offset?: number)` to accept an optional start offset in seconds. Internally, this passes the offset to `AudioBufferSourceNode.start(0, offset)`.
- Add `seek(time: number)` as a convenience method: stops the current source and calls `play(activeUrl, time)`. No-op if nothing is playing.
- Add `getProgress(): { currentTime: number; duration: number }`. Track the start time of the current playback (from `AudioContext.currentTime`) and the buffer duration. `currentTime` is computed as elapsed time since start plus any seek offset.
- Add `onProgress(cb: (currentTime: number, duration: number) => void): () => void`. Starts a `requestAnimationFrame` loop when audio is playing that calls the callback with current progress. Returns an unsubscribe function. Loop stops automatically when playback ends.
- Add `getBuffer(url: string): AudioBuffer | null` to expose cached buffers. The spectrogram renderer (Issue 3) needs the raw audio data.

Update the `AudioPlayer` interface type to include the new methods.

### How to verify

- **Automated**: Unit tests:
  - `play(url, 5.0)`: playback starts at 5s offset, `getProgress()` returns `{ currentTime: ~5.0, duration: bufferDuration }`
  - `seek(10.0)` while playing: `getProgress().currentTime` is ~10.0, `getActiveUrl()` is unchanged
  - `seek()` while stopped: no-op, no error
  - `onProgress` callback fires during playback with increasing `currentTime` values
  - `getBuffer(url)` returns the cached `AudioBuffer` after `play(url)` completes

### Acceptance criteria

- [ ] Given audio is playing, when `getProgress()` is called, then it returns `{ currentTime, duration }` where `currentTime` increases over time and `duration` matches the buffer length
- [ ] Given audio is playing at position 3s, when `seek(10.0)` is called, then playback resumes from 10s of the same clip without interruption in the audio output (beyond the seek discontinuity)
- [ ] Given audio is stopped, when `seek()` is called, then nothing happens and no error is thrown
- [ ] Given `play(url, 7.0)` is called, then playback starts from the 7-second mark
- [ ] Given a URL has been played, when `getBuffer(url)` is called, then the cached `AudioBuffer` is returned
- [ ] Given a URL has not been played or prefetched, when `getBuffer(url)` is called, then `null` is returned

### User stories addressed

- User story 6: Playhead animates across spectrogram (foundational — progress tracking)
- User story 7: Click spectrogram to seek while playing (foundational — seek capability)
- User story 8: Click spectrogram when stopped to seek and play (foundational — play with offset)

### Tasks

#### 2.1. Add play offset, seek, progress tracking, and getBuffer to AudioPlayer

**Type**: WRITE
**Output**: `audio.ts` extended with offset param, `seek()`, `getProgress()`, `onProgress()`, `getBuffer()`
**Depends on**: 1.2

- [ ] Modify `adapters/audio.ts`. Extend `play(url: string, offset?: number)` to pass the offset to `source.start(0, offset ?? 0)`. Track `playbackStartTime` (from `AudioContext.currentTime` at the moment `source.start` is called) and `playbackOffset` (the offset value) as private fields for progress calculation. Add `seek(time: number)`: if currently playing, call `play(activeUrl, time)`; if stopped, no-op. Add `getProgress(): { currentTime: number; duration: number }` that returns `{ currentTime: playbackOffset + (ctx.currentTime - playbackStartTime), duration: buffer.duration }`, or `{ currentTime: 0, duration: 0 }` if not playing. Add `onProgress(cb)`: manage a `requestAnimationFrame` loop that calls the callback with `getProgress()` values while state is `'playing'`; return an unsubscribe function; start/stop the rAF loop on state transitions. Add `getBuffer(url: string): AudioBuffer | null` that returns `this.cache.get(url) ?? null`. Update the `AudioPlayer` interface type with all new method signatures.

---

#### 2.2. Unit tests for progress and seeking

**Type**: TEST
**Output**: Extended `adapters/audio.test.ts` passes
**Depends on**: 2.1

- [ ] Extend `adapters/audio.test.ts` with a new `describe` block for progress and seeking. Test: `play(url, 5.0)` → `getProgress().currentTime` is approximately 5.0. Test: `seek(10.0)` while playing → `getProgress().currentTime` is approximately 10.0 and `getActiveUrl()` is unchanged. Test: `seek()` while stopped → no error, no state change, `getActiveUrl()` remains `null`. Test: `getBuffer(knownUrl)` returns the cached `AudioBuffer` after play. Test: `getBuffer(unknownUrl)` returns `null`. The rAF-based `onProgress` callback may need a manual timer advance or mock `requestAnimationFrame` to test.

---

## Issue 3: Spectrogram computation engine

**Type**: AFK
**Blocked by**: None — can start immediately

### Parent PRD

`rpi/plans/audio-improvements-prd-2026-04-15.md`

### What to build

A pure TypeScript module that computes spectrogram data from a Web Audio API `AudioBuffer`, as described in the PRD's "Spectrogram Computation" section.

New file `core/spectrogram.ts`:
- Implement a windowed FFT (Hann window, default 1024-sample frames) from scratch. No external library.
- Export `computeSpectrogram(buffer: AudioBuffer, options?: { fftSize?: number; hopSize?: number }): SpectrogramData`.
  - Reads channel 0 data via `buffer.getChannelData(0)`.
  - Slides the FFT window across the signal with `hopSize` (default: half of `fftSize`) step.
  - For each window: apply Hann window, compute FFT, take magnitude of each frequency bin, normalize to 0-1 range.
  - Output: `SpectrogramData` type containing `{ magnitudes: Float32Array[]; timeBins: number; frequencyBins: number; duration: number; sampleRate: number }`.
- The module must have zero DOM, React, or browser API dependencies (except the `AudioBuffer` type for the input signature). This keeps it testable in a Node/jsdom environment.

### How to verify

- **Automated**: Unit tests in `core/spectrogram.test.ts`:
  - Silence input: all magnitudes near zero
  - Pure sine wave at known frequency: magnitude peak at the expected frequency bin, low elsewhere
  - Output shape: `timeBins` matches expected `ceil(bufferLength / hopSize)`, `frequencyBins` matches `fftSize / 2`
  - Zero-length buffer: returns empty data (0 time bins) without error
  - Different `fftSize` options produce different output resolutions

### Acceptance criteria

- [ ] Given a silent AudioBuffer, when `computeSpectrogram()` is called, then all magnitude values are near zero (< 0.01)
- [ ] Given a 440Hz sine wave AudioBuffer, when `computeSpectrogram()` is called, then the magnitude peak is at the frequency bin closest to 440Hz
- [ ] Given an AudioBuffer of N samples and default options, when `computeSpectrogram()` is called, then `timeBins` equals `ceil(N / hopSize)` and `frequencyBins` equals `fftSize / 2`
- [ ] Given a zero-length AudioBuffer, when `computeSpectrogram()` is called, then it returns a `SpectrogramData` with `timeBins: 0` and no error
- [ ] The module imports no DOM, React, or browser-specific modules

### User stories addressed

- User story 4: See a spectrogram of the current clip (foundational — computation layer)

### Tasks

#### 3.1. Implement FFT and computeSpectrogram

**Type**: WRITE
**Output**: New `core/spectrogram.ts` exports `computeSpectrogram` and `SpectrogramData`
**Depends on**: none

- [ ] Create `core/spectrogram.ts`. Export a `SpectrogramData` type: `{ magnitudes: Float32Array[]; timeBins: number; frequencyBins: number; duration: number; sampleRate: number }`. Implement a Hann window function and a radix-2 Cooley-Tukey FFT (pad input to next power of 2 if needed). Export `computeSpectrogram(buffer: AudioBuffer, options?: { fftSize?: number; hopSize?: number }): SpectrogramData` with defaults `fftSize: 1024`, `hopSize: 512`. It reads channel 0 data via `buffer.getChannelData(0)`, slides the FFT window across the signal with `hopSize` step, and for each window: applies the Hann window, computes FFT, takes magnitude of each frequency bin (first half only — `fftSize / 2`), and normalizes to 0-1 range (relative to the global max magnitude across all windows). Returns `SpectrogramData` with `timeBins = ceil(sampleCount / hopSize)` and `frequencyBins = fftSize / 2`. For zero-length buffers, return `{ magnitudes: [], timeBins: 0, frequencyBins: 0, duration: 0, sampleRate: buffer.sampleRate }`. The module must have zero DOM, React, or browser-specific imports.

---

#### 3.2. Unit tests for spectrogram computation

**Type**: TEST
**Output**: `core/spectrogram.test.ts` passes
**Depends on**: 3.1

- [ ] Create `core/spectrogram.test.ts`. Follow the existing test pattern in `core/manifest.test.ts`. Create a helper function `makeAudioBuffer(samples: Float32Array, sampleRate: number)` that returns a mock object satisfying the `AudioBuffer` interface (with `getChannelData()`, `length`, `duration`, `sampleRate`). Test: silence (all zeros) → all magnitudes < 0.01. Test: 440Hz sine wave at 44100Hz sample rate → magnitude peak is at the frequency bin closest to 440Hz (bin index ≈ 440 * fftSize / sampleRate), with other bins significantly lower. Test: output shape — given N samples and default options, `timeBins` equals `Math.ceil(N / 512)` and `frequencyBins` equals 512. Test: zero-length buffer → `timeBins: 0`, no error. Test: passing custom `fftSize: 2048` produces `frequencyBins: 1024`.

---

## Issue 4: Spectrogram canvas component

**Type**: AFK
**Blocked by**: Issue 3

### Parent PRD

`rpi/plans/audio-improvements-prd-2026-04-15.md`

### What to build

A React component that renders a `SpectrogramData` object as a heatmap on an HTML `<canvas>`, as described in the PRD's "Spectrogram Rendering and Interaction" section.

New file `components/shared/Spectrogram.tsx`:
- Props: `data: SpectrogramData`, `currentTime: number`, `duration: number`, `isPlaying: boolean`, `onSeek: (time: number) => void`.
- Renders a `<canvas>` element, full width of its container, ~80px tall (configurable via prop or CSS).
- On mount (and when `data` changes): draw the full spectrogram heatmap. Map magnitude values (0-1) to a color gradient using the app's theme colors — background color for silence, primary color for loud frequencies.
- Draw a vertical playhead line at the position `(currentTime / duration) * canvasWidth`. The playhead should be a contrasting color (e.g., white or the secondary theme color) so it's visible against the heatmap.
- On click: compute `seekTime = (clickX / canvasWidth) * duration` and call `onSeek(seekTime)`.
- Handle canvas resize (window resize, container reflow) by redrawing.

This component is a static renderer with a click handler. Playhead animation timing is driven by the parent (BirdCard, Issue 5) passing updated `currentTime` values. This component does not manage any audio state.

### How to verify

- **Manual**: Import the component in a test harness or Storybook-like setup. Pass it synthetic `SpectrogramData` (e.g., from the test helpers in Issue 3). Verify: heatmap renders with theme colors, playhead line appears at the correct horizontal position for a given `currentTime`, clicking fires `onSeek` with the expected time value.
- **Automated**: The rendering itself is not unit-tested (canvas). The `onSeek` callback can be tested by simulating a click event on the canvas and asserting the computed time value.

### Acceptance criteria

- [ ] Given valid `SpectrogramData`, when the component mounts, then a colored heatmap is drawn on the canvas with frequency on the y-axis and time on the x-axis
- [ ] Given `currentTime` of half the `duration`, when the component renders, then the playhead line is at the horizontal midpoint of the canvas
- [ ] Given the user clicks at 75% of the canvas width on a 12-second clip, when `onSeek` fires, then it is called with a value of approximately 9.0
- [ ] Given the container resizes, when the component re-renders, then the canvas redraws at the new dimensions without distortion
- [ ] Given `SpectrogramData` with zero time bins, when the component renders, then it shows an empty/gray canvas without error
- [ ] The heatmap color gradient uses the app's theme colors (primary for loud, background for silent)

### User stories addressed

- User story 4: See a spectrogram of the current clip (rendering layer)
- User story 18: Spectrogram colors match the app's visual theme

### Tasks

#### 4.1. Create Spectrogram.tsx canvas component

**Type**: WRITE
**Output**: Component renders heatmap with theme colors, playhead line, click-to-seek
**Depends on**: 3.1

- [ ] Create `components/shared/Spectrogram.tsx`. Props: `data: SpectrogramData`, `currentTime: number`, `duration: number`, `isPlaying: boolean`, `onSeek: (time: number) => void`. Render a `<canvas>` element, full width of its container, ~80px tall. On mount and when `data` changes, draw the full spectrogram heatmap using the 2D canvas context: iterate over `data.magnitudes` (time bins on x-axis, frequency bins on y-axis with low frequencies at bottom), mapping each magnitude value (0-1) to a color gradient from `--color-bg` (#FAF8F5) for silence to `--color-primary` (#8B6F47) for loud. Read theme colors from CSS custom properties via `getComputedStyle`. Draw a vertical playhead line at position `(currentTime / duration) * canvasWidth` using `--color-secondary` (#5B8A72) or white for contrast. Only draw the playhead when `currentTime > 0`. On click, compute `seekTime = (event.offsetX / canvas.clientWidth) * duration` and call `onSeek(seekTime)`. Handle canvas resize via `ResizeObserver` — update `canvas.width`/`canvas.height` to match CSS dimensions (for sharp rendering on HiDPI) and redraw. For zero-bin data, render a flat gray canvas.

---

## Issue 5: BirdCard spectrogram integration (layout + playhead + seek)

**Type**: HITL (verify spectrogram sizing, color contrast, and tap accuracy on real mobile devices)
**Blocked by**: Issues 2, 4

### Parent PRD

`rpi/plans/audio-improvements-prd-2026-04-15.md`

### What to build

Wire the Spectrogram component into BirdCard so that every card in the Learn flow shows an interactive, animated spectrogram. This is the convergence point for the UI-side audio work.

Changes to BirdCard (`components/learn/BirdCard.tsx`):
- Add the `Spectrogram` component between the audio buttons and the mnemonic text.
- Track which clip set is active (songs or calls) and which clip index, so the spectrogram updates when the user switches. Default to the first song clip when no audio has been played.
- Compute `SpectrogramData` from the active clip's `AudioBuffer` (via `audioPlayer.getBuffer(url)` + `computeSpectrogram()`). Cache the result so it's not recomputed on every render.
- Subscribe to `audioPlayer.onProgress()` to drive the playhead `currentTime` prop.
- Read `audioPlayer.getState()` and `getActiveUrl()` to set the `isPlaying` prop.
- Pass `audioPlayer.seek()` as the `onSeek` handler. When audio is stopped and the user clicks the spectrogram, call `audioPlayer.play(clipUrl, seekTime)` to start from that position.
- When the active clip changes (user taps a different AudioButton), recompute the spectrogram data for the new clip.

The spectrogram should be visible at all times (not collapsed when idle). When idle, it shows the full static heatmap with no playhead, giving users a preview of the clip's frequency structure before they press play.

### How to verify

- **Manual**:
  1. Open a BirdCard in the Learn flow. Verify: spectrogram is visible below the audio buttons showing the first song clip's frequency structure.
  2. Tap "Play Song". Verify: playhead animates left-to-right across the spectrogram in sync with audio. Playhead reaches the right edge when the clip ends.
  3. While playing, tap "Play Call". Verify: spectrogram updates to show the call clip's frequency structure, playhead resets and animates for the new clip.
  4. While playing, click the middle of the spectrogram. Verify: audio jumps to the midpoint of the clip and continues playing.
  5. Stop audio. Verify: spectrogram remains visible showing the full static heatmap, no playhead.
  6. While stopped, click a position on the spectrogram. Verify: audio starts playing from that position.
  7. Swipe to the next BirdCard. Verify: audio stops, new card shows its own spectrogram.
  8. Test on a mobile device: verify the spectrogram is large enough to see frequency banding and tap accurately for seeking.

### Acceptance criteria

- [ ] Given a BirdCard with song clips, when no audio is playing, then the spectrogram shows the first song clip's full heatmap with no playhead
- [ ] Given audio is playing, when the spectrogram renders, then a playhead line animates from left to right in sync with the audio progress
- [ ] Given audio is playing, when the user clicks a position on the spectrogram, then audio seeks to that time position and continues playing
- [ ] Given audio is stopped, when the user clicks a position on the spectrogram, then audio starts playing from that position
- [ ] Given the user taps "Play Call" while viewing the song spectrogram, then the spectrogram updates to show the call clip's frequency data
- [ ] Given the user swipes to the next BirdCard, then audio stops and the new card displays its own spectrogram
- [ ] Given a mobile viewport (~375px wide), the spectrogram is tall enough (~80px) to visually distinguish frequency banding and to tap seek positions accurately

### User stories addressed

- User story 5: Spectrogram shows full clip shape when idle
- User story 6: Playhead animates across spectrogram during playback
- User story 7: Click spectrogram to seek while playing
- User story 8: Click spectrogram when stopped to seek and play
- User story 9: Spectrogram updates when switching between song and call
- User story 17: Spectrogram usable on mobile screens

### Tasks

#### 5.1. Wire Spectrogram into BirdCard with audio state

**Type**: WRITE
**Output**: BirdCard shows animated, seekable spectrogram for the active clip
**Depends on**: 2.2, 4.1

- [ ] Modify `components/learn/BirdCard.tsx`. Add local state to track which clip set is active (`'songs' | 'calls'`) and the clip index, defaulting to `('songs', 0)`. Import `computeSpectrogram` from `core/spectrogram` and `Spectrogram` from `components/shared/Spectrogram`. Get `audioPlayer` from the Zustand store. Use `useMemo` to compute `SpectrogramData` from the active clip's `AudioBuffer` via `audioPlayer.getBuffer(clip.audio_url)` and `computeSpectrogram()` — if the buffer isn't loaded yet, pass empty data. Subscribe to `audioPlayer.onStateChange()` in a `useEffect` to detect when the active URL changes (via `getActiveUrl()`), and update the active clip type/index to match. Subscribe to `audioPlayer.onProgress()` in a `useEffect` to drive `currentTime` state for the playhead. Derive `isPlaying` from whether `getActiveUrl()` matches the active clip's URL. Wire `onSeek`: if audio is currently playing, call `audioPlayer.seek(time)`; if stopped, call `audioPlayer.play(activeClipUrl, time)`. Place the `<Spectrogram>` component in the JSX between the audio buttons `<div>` and the mnemonic `<p>`, giving it full card width and the spectrogram data, currentTime, duration, isPlaying, and onSeek props.

---

#### 5.2. Verify spectrogram layout on mobile devices

**Type**: REVIEW
**Output**: HITL approval of sizing, contrast, and tap accuracy
**Depends on**: 5.1

- [ ] Run the dev server (`cd beakspeak && npm run dev`) and open on a real mobile device or browser device emulator at ~375px width. Verify: spectrogram is ~80px tall and visually shows frequency banding for bird songs. Verify: theme colors render correctly (brown gradient on cream background). Verify: tapping a position on the spectrogram accurately seeks to that time (tap target is not too small). Verify: playhead animates smoothly during playback. Verify: switching between "Play Song" and "Play Call" updates the spectrogram. If adjustments are needed, iterate on height, colors, or padding before approving.

---

## Issue 6: Content pipeline — commercial license preference + quality filters

**Type**: AFK
**Blocked by**: None — can start immediately

### Parent PRD

`rpi/plans/audio-improvements-prd-2026-04-15.md`

### What to build

Update `populate_content.py` to prefer commercially-licensed recordings, hard-filter background species, and tighten length scoring, as described in the PRD's "Content Pipeline" implementation decisions.

License tiering:
- Replace `is_license_ok()` with two functions: `is_commercial_license(url)` (accepts CC-BY, CC-BY-SA, CC0 only) and `is_any_cc_license(url)` (accepts all current licenses — CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-NC-SA, CC0, excluding ND).
- First pass: filter recordings to commercial licenses only, then score and select.
- Second pass: if fewer than 3 songs or 2 calls are found, relax to all CC licenses, log a warning to stdout naming the species and the shortfall, and continue selection.
- Add `"commercial_ok": true/false` to each clip dict in the output.

Background species filter:
- After license filtering and before scoring, hard-filter any recording where the Xeno-canto `also` field is non-empty. This field lists background species audible in the recording. Extract it from the API response in `select_xc_clips()` or at the filtering stage.

Tighter length scoring in `score_recording()`:
- 5-15s: +3 (was +2 for 5-30s)
- 15-30s: +1
- 30-60s: -1 (was +1)
- 60s+: -3 (was -1 for >120s)

Summary report:
- After processing all species, print a summary to stdout listing: species that fell back to NC licenses (with counts), species with fewer clips than target, total commercial vs NC clip counts.

Update the manifest header `license_filter` field to describe the tiered approach.

### How to verify

- **Manual**: Run `uv run python3 populate_content.py` with `XC_API_KEY` set. Review:
  1. Console output shows license pass (commercial first, fallback where needed).
  2. Summary report at the end lists any NC fallbacks.
  3. Output JSON has `"commercial_ok"` field on every audio clip.
  4. No clips have background species in their source data (verify a sample by checking the `also` field on xeno-canto.org for selected clip IDs).
  5. Selected clips trend shorter than before (compare lengths against current manifest).

### Acceptance criteria

- [ ] Given a species with sufficient commercial-licensed A/B recordings, when the pipeline runs, then all selected clips have `"commercial_ok": true`
- [ ] Given a species with insufficient commercial-licensed recordings, when the pipeline runs, then it falls back to NC licenses, logs a warning naming the species, and flags those clips with `"commercial_ok": false`
- [ ] Given a recording with a non-empty `also` field, when filtering runs, then that recording is excluded from selection
- [ ] Given a 10-second recording and a 45-second recording of equal quality and region, when scoring runs, then the 10-second recording scores higher
- [ ] Given the pipeline completes, when the summary report prints, then it lists all species with NC fallbacks and total commercial vs NC counts
- [ ] Given the pipeline completes, when the output JSON is inspected, then every audio clip has a `"commercial_ok"` boolean field

### User stories addressed

- User story 10: Clips contain only the target bird species
- User story 12: Short, focused clips (5-15 seconds)
- User story 13: Pipeline prefers commercially-licensed recordings
- User story 14: Clear warning on NC license fallback
- User story 15: Each clip flagged with `commercial_ok`
- User story 16: Summary report listing NC fallback species

### Tasks

#### 6.1. Implement two-pass license selection with commercial_ok flag

**Type**: WRITE
**Output**: Pipeline prefers commercial licenses, falls back with warning, flags each clip
**Depends on**: none

- [ ] Modify `populate_content.py`. Replace `is_license_ok(lic_url)` with two functions: `is_commercial_license(lic_url)` accepts only CC-BY, CC-BY-SA, and CC0 (checks for `creativecommons.org/licenses/by` without `-nc` present, and `publicdomain/zero`); `is_any_cc_license(lic_url)` accepts the same set as the old function (CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-NC-SA, CC0 — no `-nd`). In `process_species()`, restructure the clip selection: first filter recordings to commercial licenses only, then apply quality and scoring to select clips. If fewer than 3 songs or 2 calls are found, print a warning to stdout naming the species and shortfall (e.g., `"  ⚠ AMRO: only 1 commercial song found, relaxing to NC licenses"`), relax to `is_any_cc_license`, and re-select. Add `"commercial_ok": True/False` to each clip dict based on which license pass selected it. Update the manifest header `license_filter` to read `"Prefer CC-BY, CC-BY-SA, CC0 (commercial OK); fallback to CC-BY-NC, CC-BY-NC-SA if needed"`. Also add `commercial_ok?: boolean` to the `AudioClip` interface in `core/types.ts` for TypeScript completeness.

---

#### 6.2. Add background species filter and tighter length scoring

**Type**: WRITE
**Output**: Recordings with background species excluded, shorter clips strongly preferred
**Depends on**: none

- [ ] Modify `populate_content.py`. The Xeno-canto API returns an `also` field (a string listing background species, e.g., `"Steller's Jay, Dark-eyed Junco"` or empty string `""`). This field is already present in the API response but not currently extracted. After license filtering and before scoring, add a hard-filter step: exclude any recording where `rec.get("also", "").strip()` is non-empty. Log the count of excluded recordings (e.g., `"  [Xeno-canto] Excluded N recordings with background species"`). Update `score_recording()` length brackets: 5-15s → +3 (was +2 for 5-30s), 15-30s → +1, 30-60s → -1 (was +1), 60s+ → -3 (was -1 for >120s). Parse the length string the same way as current code (`"M:SS"` format).

---

#### 6.3. Add summary report to pipeline output

**Type**: WRITE
**Output**: Summary report prints to stdout after pipeline completes
**Depends on**: 6.1, 6.2

- [ ] Modify `populate_content.py`. After the main loop that processes all species, collect and print a formatted summary report to stdout. Track these during processing (accumulate in lists/counters): species that fell back to NC licenses (species name + count of NC clips), species with fewer clips than target (species name + actual song/call counts vs 3/2 target), total commercial clips, total NC clips, total clips overall. Print the report with clear section headers, e.g., `"═══ PIPELINE SUMMARY ═══"`, a table or list of NC fallback species, a table of under-target species, and a totals line like `"Commercial: 58/75 clips (77%), NC fallback: 17/75 clips (23%)"`.

---

## Issue 7: Content pipeline — smart trimming

**Type**: AFK
**Blocked by**: None — can start immediately

### Parent PRD

`rpi/plans/audio-improvements-prd-2026-04-15.md`

### What to build

Update `download_media.py` to find the best active audio segment before trimming, as described in the PRD's "Content Pipeline: Smart Trimming" section.

Currently, `normalize_audio()` trims blindly to the first 20 seconds via `-t 20`. Replace this with a two-step process:

1. **Detect silence**: Run ffmpeg's `silencedetect` filter on the raw download to identify silent gaps (e.g., silence threshold of -30dB, minimum duration 0.5s). Parse the output to get a list of silence start/end timestamps.
2. **Find best segment**: From the non-silent segments, select the first contiguous active region of at least 5 seconds. If the region is longer than 20 seconds, trim to the first 20 seconds of that region. The trim window should start slightly before the active region onset (~0.5s padding) so the vocalization doesn't feel abruptly cut.
3. **Trim and normalize**: Pass the computed start time and duration to ffmpeg (via `-ss` and `-t` flags) along with the existing loudnorm and encoding pipeline.
4. **Fallback**: If `silencedetect` fails, finds no silence boundaries, or the entire clip is active, fall back to the current behavior (first 20 seconds).

### How to verify

- **Manual**: Run the pipeline on a few species. Compare the output clips to the raw downloads:
  1. For a raw clip that starts with 5 seconds of silence followed by a bird call, verify the output starts at the call (not the silence).
  2. For a raw clip with a bird vocalization in the middle surrounded by silence, verify the output captures the vocalization.
  3. For a short clip (< 20s) with no silence, verify the output is identical to current behavior.
  4. Listen to 5-10 output clips and confirm they start with the target vocalization.

### Acceptance criteria

- [ ] Given a raw audio file with 3 seconds of silence followed by a vocalization, when smart trimming runs, then the output starts at approximately the vocalization onset (not at 0:00)
- [ ] Given a raw audio file with no silent gaps, when smart trimming runs, then the output is the first 20 seconds (fallback behavior)
- [ ] Given a raw audio file where `silencedetect` fails, when smart trimming runs, then the output is the first 20 seconds (fallback behavior) and a warning is logged
- [ ] Given a raw audio file with a 7-second vocalization starting at second 10, when smart trimming runs, then the output contains the full vocalization
- [ ] Output audio files are still normalized (loudnorm), encoded as OGG Opus 96kbps, and ≤20 seconds

### User stories addressed

- User story 11: Audio clips start with the target vocalization, not silence or noise

### Tasks

#### 7.1. Implement smart trimming with silencedetect

**Type**: WRITE
**Output**: Clips start at best active segment; fallback to first 20s on failure
**Depends on**: none

- [ ] Modify `download_media.py`. Add a new function `detect_best_segment(input_path: Path) -> tuple[float, float] | None` that runs ffmpeg with `-af silencedetect=noise=-30dB:d=0.5` on the input file and parses stderr for `silence_start` and `silence_end` timestamps. From those, compute non-silent segments (gaps between silence regions, plus the region before first silence and after last silence). Select the first non-silent segment that is at least 5 seconds long. Return `(start, duration)` where `start` is ~0.5s before the segment onset (clamped to 0) and `duration` is min(segment length + 0.5s padding, 20s). Return `None` if silencedetect fails (non-zero exit), finds no silence boundaries, or no segment meets the 5s minimum. Modify `normalize_audio()`: before running the loudnorm/encode pipeline, call `detect_best_segment()` on the input file. If it returns a segment, replace the existing `-t 20` with `-ss {start} -t {duration}` in the ffmpeg args. If it returns `None`, keep the existing `-t 20` behavior. Log which trimming mode was used (e.g., `"  Smart trim: 3.2s-18.2s"` or `"  Default trim: 0-20s"`).

---

## Issue 8: Re-run content pipeline with improved settings

**Type**: HITL (review summary report, listen to output clips, verify quality improvement)
**Blocked by**: Issues 6, 7

### Parent PRD

`rpi/plans/audio-improvements-prd-2026-04-15.md`

### What to build

Run the updated content pipeline end-to-end to produce improved audio clips for all 15 species. This is not a code change — it's a pipeline execution and quality review.

Steps:
1. Delete existing downloaded audio to force re-selection (or selectively delete clips that should be re-evaluated). Keep photos as-is.
2. Run `uv run python3 populate_content.py` to re-score and re-select clips with the new license tiering, background species filter, and length scoring.
3. Review the summary report. Note which species fell back to NC licenses and how many clips changed.
4. Run `uv run python3 download_media.py` to download and normalize the newly-selected clips with smart trimming.
5. Listen to a representative sample of output clips (at least 2 per species) and verify they are cleaner, shorter, and start with the target vocalization.
6. Commit the updated manifest and any new/changed audio files.

### How to verify

- **Manual**:
  1. Summary report shows the license breakdown (commercial vs NC per species).
  2. Spot-check 5+ species on xeno-canto.org: verify selected clips have no background species listed.
  3. Listen to 10+ clips across different species: they should be short, start with the bird's vocalization, and not contain obvious background birds.
  4. Compare average clip length before vs after — should trend shorter.
  5. The app loads and plays the new clips correctly.

### Acceptance criteria

- [ ] Given the updated pipeline has run, when the summary report is reviewed, then it shows how many clips are commercially licensed vs NC fallback
- [ ] Given the new audio files are deployed, when a user plays clips in the app, then the audio plays correctly and the clips sound cleaner than before
- [ ] Given the manifest is inspected, when `commercial_ok` fields are checked, then every audio clip has the field set
- [ ] Given a spot-check of 5+ species, when the selected XC IDs are looked up on xeno-canto.org, then none have background species listed in the `also` field
- [ ] The updated manifest and audio files are committed to the repository

### User stories addressed

- User story 10: Clips contain only the target bird species
- User story 11: Clips start with the target vocalization
- User story 12: Short, focused clips
- User story 13: Pipeline prefers commercially-licensed recordings

### Tasks

#### 8.1. Clear existing audio and re-run content pipeline

**Type**: CONFIG
**Output**: New manifest and audio files generated with summary report
**Depends on**: 6.3, 7.1

- [ ] Delete existing audio files under `beakspeak/public/content/audio/` to force re-selection (keep `beakspeak/public/content/photos/` intact). Run `uv run python3 populate_content.py` to re-score and re-select clips with the new license tiering, background species filter, and length scoring. Save the summary report output. Then run `uv run python3 download_media.py` to download and normalize the newly-selected clips with smart trimming. Verify the pipeline completes without errors and the new `manifest.json` has `commercial_ok` fields on every clip.

---

#### 8.2. Review pipeline output and spot-check clips

**Type**: REVIEW
**Output**: HITL approval, commit updated manifest and audio files
**Depends on**: 8.1

- [ ] Review the summary report: check license breakdown (commercial vs NC per species), species with fewer clips than target. Spot-check at least 5 species on xeno-canto.org by looking up the selected XC IDs and verifying the `also` field is empty. Listen to at least 10 output clips across different species — they should be short, start with the bird's vocalization, and not contain obvious background birds. Compare average clip lengths against the previous manifest to confirm they trend shorter. Run `cd beakspeak && npm run dev` and verify the app loads and plays the new clips correctly. Once satisfied, commit the updated manifest and audio files.
