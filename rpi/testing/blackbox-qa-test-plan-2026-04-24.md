# BeakSpeak Blackbox QA Test Plan

**Date:** 2026-04-24
**Scope:** End-to-end UI flows for a blackbox QA tester
**Platform:** Mobile-first web app (test at 375px width primary, also tablet/desktop)
**App entry:** `cd beakspeak && npm run dev` → `http://localhost:5173/beakspeak/`

---

## How to Use This Document

Each flow below describes what to test from the user's perspective. The tester should not need to read source code. Where specific app states are needed (e.g., "complete Lesson 1 first"), the prerequisite is stated explicitly.

**Severity key:**
- **P0 — Critical:** Core learning loop is broken or data loss occurs
- **P1 — High:** Feature is non-functional or badly misleading
- **P2 — Medium:** Usability issue or edge case regression
- **P3 — Low:** Visual polish or minor inconsistency

---

## 1. App Loading and Initialization

### 1.1 First load — fresh state (P0)
1. Clear site data for localhost (DevTools → Application → Storage → Clear site data).
2. Load the app URL.
3. **Verify:** A branded loading screen appears briefly (app name, no spinner).
4. **Verify:** The app loads and shows the Learn tab with 5 lessons listed.
5. **Verify:** Lesson 1 shows as "available" (tappable). Lessons 2–5 show as "locked" (visually distinct, not available).
6. **Verify:** Bottom navigation shows three tabs: Learn, Quiz, Progress.

### 1.2 Manifest load failure (P1)
1. Disconnect network or otherwise prevent manifest loading.
2. Refresh the app.
3. **Verify:** An error message appears saying the bird data could not be loaded, with a retry option.
4. Tap retry after restoring connectivity.
5. **Verify:** The app loads successfully.

### 1.3 Returning after previous session (P1)
1. Complete at least Lesson 1 (see flow 3.1).
2. Close the browser tab. Reopen the app.
3. **Verify:** Lesson 1 still shows as complete (green checkmark).
4. **Verify:** The Progress dashboard reflects the saved state.
5. **Verify:** Species introduced in the previous session still show as introduced.

---

## 2. Navigation

### 2.1 Tab switching (P0)
1. From any screen, tap each bottom tab in sequence: Learn → Quiz → Progress → Learn.
2. **Verify:** Each tab renders the correct content immediately.
3. **Verify:** The active tab is visually highlighted in the navigation bar.
4. **Verify:** Switching tabs does not lose state within a tab (e.g., if you were mid-quiz, switching away and back should restart — sessions do not persist).

### 2.2 Safe area and layout (P1)
1. On a mobile device or 375px-wide emulator with a home indicator:
2. **Verify:** The bottom navigation bar does not overlap content.
3. **Verify:** The nav bar respects safe area insets (padding for home indicator).
4. **Verify:** The app fills the full viewport height (`100dvh`).
5. **Verify:** Main content area has bottom padding so nothing is hidden behind the nav bar.

---

## 3. Learn Mode — Lesson Progression

### 3.1 Complete Lesson 1 — full flow (P0)
*This is the single most critical flow in the app.*
1. From the Learn tab, tap Lesson 1 ("The Unmistakable Three" or similar).
2. **Verify:** Three BirdCards appear in a swipeable stack for American Crow, Steller's Jay, and Northern Flicker.
3. On the first BirdCard:
   - **Verify:** Bird photo fills top ~60% of the card, edge-to-edge.
   - **Verify:** Common name overlays the photo bottom in a semi-transparent bar.
   - **Verify:** Scientific name appears below the photo in italic muted text.
   - **Verify:** "Play Song" and "Play Call" buttons are present.
   - **Verify:** Mnemonic text is shown.
   - **Verify:** Habitat tags appear as small pills.
4. Tap "Play Song":
   - **Verify:** Audio plays. The button changes to show it's playing.
   - **Verify:** A spectrogram is visible below the audio buttons, showing a heatmap.
   - **Verify:** A playhead line animates across the spectrogram during playback.
   - **Verify:** A clip counter (e.g., "1/3") is shown.
5. Tap "Play Song" again:
   - **Verify:** The clip advances to the next song (counter becomes "2/3").
   - **Verify:** Audio plays the new clip.
   - **Verify:** The spectrogram updates to show the new clip's data.
6. Tap "Play Call":
   - **Verify:** The "Play Song" button immediately shows as idle (not playing).
   - **Verify:** The call clip plays. The "Play Call" button shows playing state.
   - **Verify:** The spectrogram updates to show the call clip's frequency data.
   - **Verify:** There is a brief fade transition (no click/pop) when switching from song to call.
7. Swipe right to advance to the next BirdCard:
   - **Verify:** Audio stops immediately.
   - **Verify:** The next bird's card slides in.
8. Swipe left to go back to the previous card:
   - **Verify:** The previous bird's card appears.
   - **Verify:** Swipe left on the first card is a no-op (stays on first card).
9. View all three cards, then swipe past the last one.
10. **Verify:** An intro quiz begins automatically with 3–5 three-choice questions.
11. For each quiz question:
    - **Verify:** An audio play button is shown. Audio auto-plays or shows "Tap to play."
    - **Verify:** Three choices are displayed, each showing a bird photo and name.
    - **Verify:** The question text asks which bird is making the sound.
12. Answer correctly:
    - **Verify:** Green highlight on the chosen card.
    - **Verify:** Mnemonic text appears for reinforcement.
    - **Verify:** Auto-advance after ~1.5 seconds.
13. Answer incorrectly:
    - **Verify:** Red highlight on the chosen card. Green highlight on the correct card.
    - **Verify:** Correct bird's photo and mnemonic are shown.
    - **Verify:** A "Play correct sound" button is available.
    - **Verify:** Manual "Next" button required to advance.
14. Complete all quiz questions.
15. **Verify:** A results summary appears.
16. **Verify:** After results, the app returns to the Learn tab.
17. **Verify:** Lesson 1 now shows as completed (green checkmark or similar).
18. **Verify:** Lesson 2 is now unlocked/available.

### 3.2 Lesson 2+ includes review warm-up (P1)
1. Complete Lesson 1 (flow 3.1).
2. Tap Lesson 2 to start it.
3. **Verify:** Before the new BirdCards appear, 2–3 quick review questions on Lesson 1 birds appear first (forward testing effect).
4. **Verify:** These warm-up questions auto-advance on correct answer.
5. **Verify:** After warm-up, the new BirdCards for Lesson 2 species appear.
6. Complete the lesson normally.
7. **Verify:** Lesson 2 marks as complete, Lesson 3 unlocks.

### 3.3 Locked lesson interaction (P0)
1. From a fresh state (no lessons completed), tap Lesson 2 or any locked lesson.
2. **Verify:** A modal dialog appears explaining why the lesson is locked (prerequisite missing).
3. **Verify:** The modal title is "Take It Step by Step" (prerequisite framing).
4. **Verify:** The modal explains consequences of skipping.
5. **Verify:** The modal has a "Never mind" button and can also be dismissed by tapping outside.
6. Tap "Never mind" or outside the modal.
7. **Verify:** The modal closes. No progress is changed.

### 3.4 Skip-ahead unlock with confirmation (P1)
1. Complete Lesson 1.
2. Tap Lesson 3 (a locked lesson that skips Lesson 2).
3. **Verify:** The unlock dialog appears.
4. **Verify:** The dialog names the specific skipped lesson(s) (e.g., "Lesson 2: ...") and the bird count.
5. Tap "Skip Ahead Anyway" to confirm.
6. **Verify:** Skipped intervening lessons (Lesson 2) are immediately marked as learned.
7. **Verify:** The selected lesson (Lesson 3) opens directly in the lesson session without the review warm-up.
8. Complete Lesson 3 normally.
9. Return to Learn tab.
10. **Verify:** Lessons 1, 2, and 3 all show as complete.

### 3.5 Skip-ahead preserves existing progress (P2)
1. Complete Lessons 1 and 2. Ensure some quiz answers in Lesson 2 produced FSRS history.
2. Tap Lesson 5 (locked, skipping Lessons 3 and 4).
3. Confirm the unlock.
4. **Verify:** Species from Lessons 3 and 4 are marked introduced, but existing FSRS history for Lessons 1 and 2 species is not reset.
5. Check the Progress dashboard.
6. **Verify:** Lesson 1 and 2 species still have their original reps/lapses/state.

### 3.6 Skip-ahead requires re-confirmation after backing out (P2)
1. Complete Lesson 1.
2. Tap Lesson 3 (locked).
3. Confirm the unlock.
4. Once the lesson session opens, exit/back out before completing it.
5. Tap Lesson 3 again.
6. **Verify:** The unlock dialog appears again (no persistent "manually unlocked" state).

### 3.7 Locked lesson during relearning state (P1)
1. Advance far enough that some birds enter "relearning" state (answer incorrectly in quizzes).
2. Go to Learn tab.
3. Tap a locked lesson.
4. **Verify:** The unlock dialog appears with the "Practice First" title (relearning framing).
5. **Verify:** If both prerequisite and relearning conditions exist, relearning framing takes precedence.

### 3.8 Redo a completed lesson (P1)
1. Complete any lesson.
2. From the Learn tab, tap the completed lesson.
3. **Verify:** The lesson opens immediately (not disabled) even if other birds are in relearning state.
4. **Verify:** No review warm-up phase appears.
5. Step through cards and intro quiz.
6. Complete the redo session.
7. **Verify:** The completion screen says it was a refresher and that the review schedule was not changed.
8. **Verify:** The primary button says "Back to Lessons."
9. **Verify:** No FSRS state was updated for the redo'd species (check Progress dashboard).

### 3.9 Back button during lesson intro quiz (P1)
1. Start any lesson that reaches the intro quiz phase.
2. During the intro quiz, tap "Back."
3. **Verify:** The app exits the lesson flow entirely and returns to the lesson list.
4. **Verify:** It does NOT skip the quiz or continue to the next question.

### 3.10 Spectrogram interaction on BirdCard (P1)
1. Open any BirdCard in a lesson session.
2. **Verify:** Spectrogram is visible even when no audio is playing (shows full static heatmap).
3. Tap "Play Song."
4. **Verify:** Playhead animates left to right in sync with audio.
5. While playing, click/tap the middle of the spectrogram.
6. **Verify:** Audio seeks to approximately the midpoint and continues playing.
7. Let the audio finish (or stop it).
8. While stopped, click/tap a position on the spectrogram (e.g., 75% across).
9. **Verify:** Audio starts playing from that position.
10. Switch from "Play Song" to "Play Call."
11. **Verify:** Spectrogram updates to display the call clip's frequency data.

### 3.11 Spectrogram idle state (P2)
1. Open a BirdCard. Do not tap any play button.
2. **Verify:** Spectrogram shows the first song clip's heatmap (no playhead).
3. **Verify:** The spectrogram is approximately 80px tall and full card width.

### 3.12 Clip rotation — never same clip twice in a row (P2)
1. On a BirdCard, tap "Play Song" multiple times.
2. **Verify:** Each tap cycles to a different clip. The same clip never plays twice consecutively.
3. **Verify:** The clip counter (e.g., "1/3", "2/3", "3/3") updates accordingly.

### 3.13 Attribution info (P2)
1. On a BirdCard, find the (i) info icon near the audio button or photo.
2. Tap it.
3. **Verify:** Recordist name, XC ID, and license are shown for audio.
4. **Verify:** Photo source and license are shown.
5. Dismiss the attribution info.

---

## 4. Quiz Mode — Review Sessions

### 4.1 Start a review quiz when birds are due (P0)
1. Complete Lesson 1. Wait or manipulate FSRS state so birds are due for review.
2. Go to the Quiz tab.
3. **Verify:** The count of birds due for review is shown.
4. **Verify:** A "Start Review" button is present and enabled.
5. Tap "Start Review."
6. **Verify:** A quiz session begins with 8–10 items.
7. **Verify:** The session contains a mix of three-choice and same-different exercises.

### 4.2 Three-choice quiz exercise (P0)
1. During a quiz session, encounter a three-choice item.
2. **Verify:** Audio auto-plays. If autoplay is blocked, a "Tap to play" fallback appears.
3. **Verify:** Three choices are displayed with bird photos and names.
4. **Verify:** "Which bird is this?" prompt is shown.
5. Answer quickly (within ~2.5 seconds):
   - **Verify:** If correct, the response is treated as "Easy" (fast correct).
6. Answer normally (within ~2.5–7 seconds):
   - **Verify:** Correct answer produces green highlight, auto-advance after ~1.5s.
7. Answer slowly (wait >7 seconds before selecting):
   - **Verify:** If correct, treated as "Hard."
8. Answer incorrectly:
   - **Verify:** Red on chosen, green on correct.
   - **Verify:** Correct bird info, mnemonic, and play-correct-sound button appear.
   - **Verify:** Manual "Next" button required.

### 4.3 Same-different exercise (P0)
1. During a quiz session, encounter a same-different item.
2. **Verify:** Two clips play sequentially with ~1.5s pause between them.
3. **Verify:** A visual indicator shows "Clip 1 of 2" / "Clip 2 of 2" during playback.
4. **Verify:** After both clips play, "Same species or different?" prompt appears.
5. **Verify:** Two large buttons: "Same" and "Different" are shown.
6. Answer correctly:
   - **Verify:** Both species are revealed with photos. Correct/incorrect feedback shown.
7. Answer incorrectly:
   - **Verify:** Both species are revealed. Correct answer is highlighted.
8. **Verify:** Approximately 50/50 split between same and different questions across a session.

### 4.4 Quiz result screen (P1)
1. Complete a full quiz session (answer all 8–10 items).
2. **Verify:** A result screen shows score (X/Y correct).
3. **Verify:** Birds marked "Again" (incorrect answers) are listed under "Needs More Practice."
4. **Verify:** Next review info is shown (e.g., "3 birds due for review tomorrow").
5. **Verify:** A "Back to Home" button returns to the Quiz tab.

### 4.5 FSRS scheduling updates after review (P1)
1. Complete a review quiz session. Note which birds you answered correctly and incorrectly.
2. Go to the Progress dashboard.
3. **Verify:** Species answered correctly have updated reps, state, and next review dates.
4. **Verify:** Species answered incorrectly ("Again") show appropriate FSRS state (relearning or short interval).
5. **Verify:** Confusion events are logged (if visible in the UI or checkable via DevTools → IndexedDB).

### 4.6 Quiz tab — no birds introduced yet (P2)
1. From a fresh state (clear site data), go to the Quiz tab.
2. **Verify:** The tab prompts the user to start learning first.
3. **Verify:** No "Start Review" or "Practice Anyway" button is shown.

### 4.7 Quiz tab — nothing due, guided path available (P1)
1. Complete at least Lesson 1. Wait until no birds are due (or manipulate state).
2. Go to the Quiz tab.
3. **Verify:** Next review date is shown.
4. **Verify:** "Learn More Birds" is the primary CTA.
5. **Verify:** "Practice Anyway" appears as a secondary CTA (only if at least 3 birds are introduced).
6. Tap "Learn More Birds."
7. **Verify:** Navigates to the Learn tab.

### 4.8 Quiz tab — nothing due, relearning blocks learning (P1)
1. Have birds in relearning state AND no birds due.
2. Go to the Quiz tab.
3. **Verify:** A relearning/mastery warning message is shown.
4. **Verify:** "Practice Anyway" is the only actionable CTA (no "Learn More Birds").

### 4.9 Quiz tab — nothing due, all lessons complete (P2)
1. Complete all 5 lessons. Ensure no birds are due.
2. Go to the Quiz tab.
3. **Verify:** Only "Practice Anyway" is shown (no "Learn More Birds").

### 4.10 Practice mode session (P1)
1. Get to a state where "Practice Anyway" is available (at least 3 birds introduced, none due).
2. Tap "Practice Anyway."
3. **Verify:** The session header shows "Practice Session" and "This won't change your review schedule."
4. Complete the session.
5. **Verify:** The result screen explicitly states the review schedule was not changed.
6. **Verify:** The "Needs More Practice" heading still appears for incorrect answers.
7. Check the Progress dashboard.
8. **Verify:** No FSRS scheduling was updated. No confusion events were logged.

### 4.11 Practice mode — fewer than 3 birds introduced (P2)
1. Complete only Lesson 1 (3 birds introduced). Ensure no birds are due.
2. Go to the Quiz tab.
3. **Verify:** "Practice Anyway" is available (3 birds = threshold met).
4. Now imagine only 2 birds were introduced (edge case).
5. **Verify:** "Practice Anyway" does NOT appear if fewer than 3 birds are introduced.

### 4.12 Practice mode not shown when birds are due (P2)
1. Have birds due for review.
2. Go to the Quiz tab.
3. **Verify:** "Start Review" is shown.
4. **Verify:** "Practice Anyway" is NOT shown alongside it.

---

## 5. Progress Dashboard

### 5.1 Dashboard display (P1)
1. Go to the Progress tab.
2. **Verify:** All 15 Tier 1 birds are listed.
3. **Verify:** Each bird shows: photo thumbnail, common name, SRS state badge (new/learning/review), next review date, total reps.
4. **Verify:** An overall progress bar shows X/15 birds introduced, Y/15 in review state.
5. **Verify:** If birds are due for review, a "Start Review" quick-launch button appears.

### 5.2 Dashboard reflects learning progress (P1)
1. Complete Lesson 1.
2. Go to the Progress dashboard.
3. **Verify:** The 3 Lesson 1 species show as "learning" state with 1+ reps.
4. **Verify:** The remaining 12 species show as "new."
5. **Verify:** Progress bar shows 3/15 introduced.

### 5.3 Dashboard reflects quiz outcomes (P1)
1. Complete a quiz session where you answer some correctly and some incorrectly.
2. Go to the Progress dashboard.
3. **Verify:** Correctly answered species show updated next review dates (further in the future).
4. **Verify:** Incorrectly answered species show "Again" or "relearning" state with shorter intervals.

---

## 6. Credits and Attribution

### 6.1 Credits page (P2)
1. Navigate to the Credits page (via a link from the navigation or settings).
2. **Verify:** The page is a scrollable list grouped by species.
3. **Verify:** Each species lists its audio recordings with recordist name, XC ID, and license.
4. **Verify:** Each species lists its photo source and license.
5. **Verify:** Links to Xeno-canto pages and Wikipedia are present and functional.
6. **Verify:** App version info is shown at the bottom.

---

## 7. Audio System

### 7.1 Audio playback — single clip at a time (P0)
1. Open a BirdCard with both song and call clips.
2. Tap "Play Song."
3. While song is playing, tap "Play Call."
4. **Verify:** Only one clip plays at a time — song stops, call starts.
5. **Verify:** The "Play Song" button immediately shows idle. The "Play Call" button shows playing.
6. **Verify:** No audible click/pop artifact during the switch (brief fade transition).

### 7.2 Audio stops on card swipe (P0)
1. In a Learn session, start playing audio on a BirdCard.
2. Swipe to the next card.
3. **Verify:** Audio stops immediately.
4. **Verify:** The previous card's play button does not remain in a "playing" state.

### 7.3 Audio loading state (P2)
1. Clear browser cache. Open a BirdCard.
2. Tap "Play Song" for the first time.
3. **Verify:** A loading indicator appears briefly while the audio buffer is fetched.
4. **Verify:** Once loaded, playback begins.

### 7.4 Spectrogram click-to-seek while playing (P1)
1. On a BirdCard, tap "Play Song."
2. While audio is playing, click a position on the spectrogram (e.g., 75% across).
3. **Verify:** Audio jumps to that position and continues playing from there.
4. **Verify:** The playhead updates to the clicked position.

### 7.5 Spectrogram click-to-seek while stopped (P1)
1. On a BirdCard, ensure no audio is playing.
2. Click a position on the spectrogram (e.g., 50% across).
3. **Verify:** Audio starts playing from that position.
4. **Verify:** The playhead begins animating from that position.

---

## 8. Edge Cases and Error Handling

### 8.1 Abandoned learn session (P2)
1. Start a lesson. View one or two cards. Do not complete it.
2. Navigate away (tap another tab).
3. Return to the Learn tab.
4. Tap the same lesson again.
5. **Verify:** The lesson restarts from the beginning (no session persistence).

### 8.2 Abandoned quiz session (P2)
1. Start a quiz session. Answer a few questions.
2. Navigate away or quit.
3. Start a new quiz session.
4. **Verify:** The session starts fresh (no partial state carried over).

### 8.3 Sparse clip set — species with one song/one call (P2)
1. If the manifest contains any species with only one song and/or one call clip:
2. View that species' BirdCard.
3. **Verify:** Play buttons still work normally.
4. **Verify:** Clip counter shows "1/1" (or similar for single clip).
5. Tap the play button multiple times.
6. **Verify:** No crash or unexpected behavior with a single clip.
7. Encounter that species in a same-different quiz item.
8. **Verify:** The exercise is not degenerate (same clip not played against itself as a trick).

### 8.4 Mobile viewport — responsive layout (P1)
1. Test the entire app at 375px width (iPhone SE / iPhone Mini).
2. **Verify:** All content is readable without horizontal scroll.
3. **Verify:** BirdCard photos scale properly.
4. **Verify:** Quiz choice cards fit on screen without overflow.
5. **Verify:** Bottom navigation is fully visible and tappable.
6. **Verify:** Spectrogram is tall enough to see frequency banding (~80px).
7. **Verify:** Tapping on the spectrogram for seeking works accurately on touch.

### 8.5 Tablet/desktop viewport (P3)
1. Test at 768px and 1024px widths.
2. **Verify:** Layout remains usable and content doesn't stretch awkwardly.
3. **Verify:** Bottom navigation still functions.

### 8.6 No "practice anyway" when fewer than 3 birds introduced (P2)
1. Complete only Lesson 1 (3 birds introduced). Verify "Practice Anyway" IS available.
2. If possible to test with 2 birds introduced: verify "Practice Anyway" does NOT appear.

### 8.7 Soft gate — relearning blocks next lesson (P2)
1. Get birds into "relearning" state (answer incorrectly in quiz).
2. Go to Learn tab.
3. **Verify:** The next uncompleted lesson is NOT offered for normal start.
4. **Verify:** Only the unlock dialog path is available (if tapping the locked lesson).

### 8.8 Completed lesson redo during relearning (P2)
1. Have birds in "relearning" state.
2. Go to Learn tab.
3. Tap a completed lesson.
4. **Verify:** The redo session still launches (relearning does not block redo).

---

## 9. Cross-Cutting Concerns

### 9.1 No browser console errors during normal use (P0)
1. Open DevTools console.
2. Walk through the full Lesson 1 flow (flow 3.1).
3. Complete a quiz session.
4. Visit the Progress dashboard.
5. Visit the Credits page.
6. **Verify:** No errors or warnings appear in the browser console at any point.

### 9.2 Data persistence across sessions (P1)
1. Complete Lesson 1 and a quiz session.
2. Note the Progress dashboard state.
3. Close the browser tab entirely.
4. Reopen the app.
5. **Verify:** All progress is preserved (introduced species, FSRS state, review dates).

### 9.3 Performance — audio loading (P2)
1. On a BirdCard, tap "Play Song" for the first time.
2. **Verify:** Audio begins playing within a reasonable time (<2s on normal connection).
3. Tap "Play Song" again (second clip, cached).
4. **Verify:** Playback begins nearly instantly.

### 9.4 Accessibility basics (P2)
1. Tab through the Learn tab interface using keyboard only.
2. **Verify:** All interactive elements (buttons, cards) are focusable.
3. **Verify:** Focus indicators are visible.
4. Use a screen reader if available.
5. **Verify:** Play buttons have accessible labels (bird name + clip type).
6. **Verify:** Quiz choices have descriptive labels.

---

## Test Execution Priority

For a first pass, test in this order:

1. **Flow 1.1** — App loads fresh
2. **Flow 3.1** — Complete Lesson 1 (most critical path)
3. **Flow 2.1** — Tab switching
4. **Flow 7.1** — Single audio clip at a time
5. **Flow 7.2** — Audio stops on swipe
6. **Flow 4.1** — Start review quiz
7. **Flow 4.2** — Three-choice quiz exercise
8. **Flow 4.3** — Same-different exercise
9. **Flow 5.1** — Progress dashboard
10. **Flow 9.1** — No console errors

Then proceed to remaining flows grouped by severity (P1 → P2 → P3).

---

## Appendix: Prerequisite State Summary

| To test this flow | You need this state |
|---|---|
| Fresh start / first load | Clear all site data |
| Lesson 1 available | Fresh state (default) |
| Lesson 2+ available | Complete prior lesson(s) |
| Locked lesson | Don't complete prerequisite |
| Skip-ahead unlock | Complete Lesson 1+, tap Lesson 3+ |
| Review quiz with due birds | Complete Lesson 1+, wait for FSRS due date |
| Practice Anyway | 3+ birds introduced, 0 birds due |
| Redo completed lesson | At least 1 completed lesson |
| Relearning state | Answer incorrectly in quiz until bird enters relearning |
| All lessons complete | Complete all 5 lessons |
