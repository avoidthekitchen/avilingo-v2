# PRD: Audio Improvements — Spectrogram, Playback Fix, and Content Quality

## Problem Statement

BeakSpeak's audio experience has three gaps that hurt the learning experience:

1. **Confusing playback state**: When a user rapidly taps "Play Song" then "Play Call" on a BirdCard, the underlying audio correctly stops and switches, but the button UI gets confused — both buttons may show as "playing" or "loading" because each tracks state independently via its own listener on a shared global player. Users can't tell which clip is actually playing.

2. **No playback progress or visual feedback**: Audio clips play with no indication of progress, duration, or frequency content. Users can't see where they are in a clip, can't seek to a specific moment, and miss the learning opportunity of associating visual frequency patterns with bird vocalizations.

3. **Noisy source clips**: Some Xeno-canto recordings contain multiple bird species in the background, are longer than necessary, or start with silence before the target vocalization. The content pipeline scores and selects clips but doesn't filter on background species, doesn't strongly penalize long clips, and trims blindly to the first 20 seconds regardless of where the target vocalization occurs. All current audio clips also use non-commercial (CC-BY-NC-SA) licenses, which limits future options.

## Solution

When this work is complete:

- Only one audio clip plays at a time, and the UI always correctly reflects which clip is active. Switching between clips has a brief visual fade transition rather than an abrupt cut.
- Every BirdCard displays an interactive spectrogram that shows the frequency structure of the current clip. The spectrogram is visible even when idle (showing the full clip shape), animates a playhead during playback, and is clickable to seek to any position. Users build visual-auditory associations as a natural part of the learning flow.
- The content pipeline prefers commercially-licensed recordings, hard-filters clips with background species, favors shorter clips, and uses smart trimming to find the best segment of each recording. The manifest tracks which clips are commercially licensed. A summary report flags species that fell back to non-commercial licenses.

## User Stories

1. As a learner, I want only one audio clip playing at a time, so that I'm never confused by overlapping sounds.
2. As a learner, I want the "Play Song" button to immediately show as idle when I tap "Play Call", so that I can tell which clip is active.
3. As a learner, I want a brief visual fade when switching between clips, so that the transition feels intentional rather than jarring.
4. As a learner, I want to see a spectrogram of the current clip on each BirdCard, so that I can associate visual frequency patterns with what I hear.
5. As a learner, I want the spectrogram to show the full clip shape when no audio is playing, so that I can see the structure of the recording before I listen.
6. As a learner, I want a playhead to animate across the spectrogram during playback, so that I know where I am in the clip.
7. As a learner, I want to click any position on the spectrogram while audio is playing, so that I can jump to a specific moment I want to re-hear.
8. As a learner, I want clicking the spectrogram when audio is stopped to seek to that position and start playing, so that the interaction is consistent regardless of playback state.
9. As a learner, I want the spectrogram to update when I switch between "Play Song" and "Play Call", so that I see the visualization for whichever clip type I selected.
10. As a learner, I want audio clips that contain only the target bird species, so that I'm not confused by background birds during training.
11. As a learner, I want audio clips that start with the target vocalization (not silence or distant noise), so that every second of the clip is useful for learning.
12. As a learner, I want short, focused clips (5-15 seconds), so that I can replay and study individual vocalizations quickly.
13. As a content curator, I want the pipeline to prefer commercially-licensed recordings, so that I have flexibility for future distribution.
14. As a content curator, I want a clear warning when the pipeline falls back to non-commercial licenses for a species, so that I know which species need attention.
15. As a content curator, I want each clip in the manifest flagged with `commercial_ok: true/false`, so that I can track licensing status programmatically.
16. As a content curator, I want a summary report after the pipeline runs listing all species that required non-commercial fallbacks, so that I have a single place to review licensing gaps.
17. As a learner using a mobile device, I want the spectrogram to be large enough to see frequency patterns and tap accurately, so that the feature works on small screens.
18. As a learner, I want the spectrogram colors to match the app's visual theme, so that the visualization feels integrated rather than bolted on.
19. As a learner in a quiz, I want audio playback to continue working correctly (auto-play, replay buttons), so that quiz components are not broken by the audio system changes.
20. As a learner swiping between BirdCards, I want audio to stop immediately on swipe, so that clips don't bleed between cards.

## Implementation Decisions

### Audio State Coordination

The root cause of the UI bug is that each `AudioButton` subscribes to `onStateChange` independently, but the global `WebAudioPlayer` broadcasts all state transitions to all listeners without indicating which clip caused the transition. The fix is to track the active URL centrally in the player and expose it via `getActiveUrl()`. Each `AudioButton` compares the active URL against its own clip URLs to determine whether it should reflect the playing/loading state or show idle.

### Spectrogram Computation

The spectrogram is computed client-side from the decoded `AudioBuffer` already cached by the player. A windowed FFT (e.g., Hann window, 1024-sample frames) produces a 2D grid of time bins x frequency bins. This is computed once per clip when the buffer is first available and cached alongside it. No external libraries are needed — the FFT implementation is ~50 lines of pure TypeScript.

### Spectrogram Rendering and Interaction

The spectrogram renders on a `<canvas>` element placed on the BirdCard between the audio buttons and the mnemonic text. It is full card width and approximately 80px tall — large enough to see frequency banding and tap accurately on mobile, small enough not to dominate the card layout.

The heatmap uses the app's existing theme colors (mapping magnitude to a gradient from background to primary color). A vertical playhead line animates across the canvas during playback via `requestAnimationFrame`.

Click-to-seek behavior is consistent: clicking any position on the spectrogram computes the target time as `(clickX / canvasWidth) * duration`, seeks to that position, and starts playing. This is true whether audio is currently playing or stopped — the universal convention for clickable audio timelines.

### Seeking via Web Audio API

The Web Audio API's `AudioBufferSourceNode` does not support seeking on an existing source. To seek: stop the current source node, create a new one from the same buffer, and call `source.start(0, offsetInSeconds)`. This is handled internally by extending `play()` to accept an optional offset parameter.

### Fade-Out on Stop

When `stop()` is called (either explicitly or implicitly when `play()` is called for a new clip), the player applies a short gain ramp (~100ms) to zero before disconnecting the source. This prevents click artifacts and provides the brief fade transition when switching between clips. Implemented via `GainNode.gain.linearRampToValueAtTime()`.

### Content Pipeline: License Tiering

The `is_license_ok()` function is replaced with two-pass selection:
- **Pass 1**: Filter for commercial-compatible licenses only (CC-BY, CC-BY-SA, CC0 — no `-NC` variants).
- **Pass 2**: If fewer than 3 songs or 2 calls are found, relax to include CC-BY-NC and CC-BY-NC-SA (still excluding `-ND`), log a warning, and flag each fallback clip with `"commercial_ok": false`.

Each clip in the manifest gets a `"commercial_ok"` boolean field. The manifest header's `license_filter` description is updated to reflect the tiered approach.

### Content Pipeline: Background Species Filter

Xeno-canto recordings include an `also` field listing background species audible in the recording. The pipeline hard-filters any recording where `also` is non-empty. This is applied before scoring, reducing the candidate pool to single-species recordings.

### Content Pipeline: Tighter Length Scoring

The scoring function is updated to more aggressively favor short clips:
- 5-15s: +3 (was +2 for 5-30s)
- 15-30s: +1
- 30-60s: -1 (was +1)
- 60s+: -3 (was -1 for >120s)

### Content Pipeline: Smart Trimming

Instead of blindly taking the first 20 seconds, `download_media.py` runs ffmpeg's `silencedetect` filter on the raw download to identify quiet gaps. It then selects the first non-silent segment of sufficient length (target: 5-15s of active audio) and trims around that window. If silence detection fails or finds nothing useful, the current behavior (first 20s) is the fallback.

### Scope of UI Changes

The spectrogram is added to `BirdCard` in the Learn flow only. Quiz components (`ThreeChoiceQuiz`, `SameDifferent`, `IntroQuiz`) use `audioPlayer.play()` directly and are unaffected by the spectrogram work. The AudioPlayer interface changes (offset parameter, getActiveUrl, getProgress, fade-out) are additive and backward-compatible — quiz components continue to work without modification.

## Module Design

### AudioPlayer (`adapters/audio.ts` — modify)

- **Responsibility**: Single source of truth for all audio playback, state, and progress.
- **Interface**:
  - `play(url: string, offset?: number): Promise<void>` — stop current, play from optional offset
  - `stop(): void` — fade out (~100ms) then disconnect
  - `seek(time: number): void` — shortcut for `play(activeUrl, time)`
  - `getActiveUrl(): string | null` — URL of the currently playing/loading clip
  - `getProgress(): { currentTime: number; duration: number }` — elapsed and total time
  - `onStateChange(cb): () => void` — existing, unchanged
  - `onProgress(cb: (currentTime: number, duration: number) => void): () => void` — new, fires via `requestAnimationFrame` during playback
  - `prefetch(url): void` — existing, unchanged
  - `getBuffer(url: string): AudioBuffer | null` — expose cached buffer for spectrogram computation
  - Failure modes: fetch errors and decode errors set state to `'error'`. Seeking on a null buffer is a no-op.
- **Tested**: Yes

### Spectrogram Renderer (`core/spectrogram.ts` — new)

- **Responsibility**: Compute spectrogram data from an AudioBuffer. Pure computation, no DOM or React dependencies.
- **Interface**:
  - `computeSpectrogram(buffer: AudioBuffer, options?: { fftSize?: number; hopSize?: number }): SpectrogramData`
  - `SpectrogramData`: `{ magnitudes: Float32Array[]; timeBins: number; frequencyBins: number; duration: number; sampleRate: number }`
  - Each entry in `magnitudes` is one time slice; values are normalized 0-1 magnitude.
  - Failure modes: returns empty data for zero-length buffers.
- **Tested**: Yes — verify output shape, frequency peaks for known pure-tone inputs, silence produces near-zero magnitudes.

### Spectrogram Component (`components/shared/Spectrogram.tsx` — new)

- **Responsibility**: Render spectrogram heatmap to canvas, animate playhead, handle click-to-seek.
- **Interface (props)**:
  - `data: SpectrogramData` — precomputed spectrogram grid
  - `currentTime: number` — elapsed playback time (drives playhead position)
  - `duration: number` — total clip duration
  - `isPlaying: boolean` — whether playback is active (controls playhead animation)
  - `onSeek: (time: number) => void` — called when user clicks a position
  - Failure modes: renders an empty/gray canvas if `data` has zero bins.
- **Tested**: No — canvas rendering is tested indirectly through the Spectrogram Renderer module.

### AudioButton (`components/shared/AudioButton.tsx` — modify)

- **Responsibility**: Play/stop toggle for a specific set of clips.
- **Interface**: Props unchanged. Internal change: replaces local `audioState` tracking with comparison of `audioPlayer.getActiveUrl()` against own clip URLs. Removes individual `onStateChange` subscription in favor of reading centralized state.
- **Tested**: Covered by AudioPlayer tests for state coordination. No dedicated AudioButton tests needed.

### BirdCard (`components/learn/BirdCard.tsx` — modify)

- **Responsibility**: Display species info, audio controls, and shared spectrogram.
- **Interface**: Props unchanged. Adds `Spectrogram` component between audio buttons and mnemonic text. Tracks which clip set (songs/calls) was last played to show the correct spectrogram. Defaults to first song clip's spectrogram when idle.
- **Tested**: No.

### Content Pipeline — populate_content.py (modify)

- **Responsibility**: Fetch, filter, score, and select Xeno-canto recordings.
- **Interface**: Input/output JSON files unchanged. Behavioral changes: two-pass license selection, `also` field hard-filter, tighter length scoring, `commercial_ok` flag per clip, summary report to stdout.
- **Tested**: No — validated by inspection of output manifest and summary report.

### Content Pipeline — download_media.py (modify)

- **Responsibility**: Download, normalize, and trim audio clips.
- **Interface**: Input/output unchanged. Behavioral change: smart trimming via `silencedetect` before the existing loudnorm/encode pipeline. Fallback to first-20s on detection failure.
- **Tested**: No — validated by listening to output clips.

## Testing Decisions

Good tests for this feature verify external behavior, not implementation details:

- **AudioPlayer state transitions**: play → loading → playing → idle; play while playing (stop-before-play guarantee); seek mid-playback; getActiveUrl reflects current clip; getProgress returns sensible values.
- **Spectrogram computation**: known input (silence, pure sine wave, white noise) produces expected output shape and magnitude distribution. Edge case: zero-length buffer.
- **State coordination**: when play is called with URL-A, then immediately with URL-B, getActiveUrl returns URL-B and state settles to 'playing' (not stuck in 'loading' from the first call).

Reference tests in the codebase: `beakspeak/src/core/*.test.ts` — these follow the pattern of testing pure functions with known inputs and assertions on output shape/values.

Quiz components (`ThreeChoiceQuiz`, `SameDifferent`, `IntroQuiz`) should continue to pass existing tests without modification, serving as regression coverage for the AudioPlayer interface changes.

## Out of Scope

- **Spectrogram in quiz components**: The spectrogram is added to BirdCard only. Quiz components have different UX patterns (auto-play, sequential playback, timed responses) and adding spectrograms there is a separate design decision.
- **Pause/resume model**: The current play/stop model is retained. Pause would pair well with seeking but is a larger UX change that can be added later if needed.
- **Spectrogram zoom or frequency labels**: The spectrogram is a learning aid and progress bar, not a scientific analysis tool. No axis labels, zoom, or frequency readouts.
- **Confuser drill and clip-to-photo exercise types**: These were deferred in the sprint 0-2 plan and remain deferred.
- **Photo licensing changes**: Only audio licensing is addressed. Wikipedia photos are already CC-BY-SA.
- **Re-downloading all audio**: The pipeline re-run will re-score and may select different clips. Only newly-selected clips are downloaded; existing cached files are kept if still selected.

## Open Questions

1. **How sparse are commercial licenses for PNW birds on Xeno-canto?**
   Owner: Content curator (user). Resolution: Run the updated pipeline and review the summary report. If commercial coverage is very low, consider expanding the region filter or accepting NC for the initial release.

2. **Should the spectrogram be added to quiz feedback screens?**
   Owner: Product (user). Resolution: Defer to post-launch feedback. If learners find the spectrogram valuable on BirdCards, consider adding it to the "correct answer" feedback in quizzes.

3. **Is 80px tall sufficient for the spectrogram on small mobile screens?**
   Owner: Design (user). Resolution: Implement at 80px and test on a few real devices. Adjust if needed — the component should be height-configurable via a prop.

## Further Notes

- The `prefetch()` method on `WebAudioPlayer` exists but is never called anywhere in the codebase. It could be used to pre-compute spectrograms for upcoming cards in the Learn flow, improving perceived performance. This is an optimization opportunity but not part of this PRD.
- The Xeno-canto API provides pre-rendered sonogram images (`sono` field) for every recording. These are not used in this work but could serve as a fallback or comparison reference during development.
- The content pipeline must be re-run after the scoring and filtering changes. This will likely change which clips are selected for some species. The download step only fetches newly-selected clips; it skips files that already exist locally.
- Quiz components call `audioPlayer.play()` directly and don't use `AudioButton`. The AudioPlayer interface changes are additive (new optional parameter, new methods), so quiz components require no code changes.
