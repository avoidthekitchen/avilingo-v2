# Unlockable Guided Path

**Date:** 2026-04-22
**Status:** Final

## Problem

The default learning experience is intentionally guided: lessons unlock sequentially, reviews follow FSRS scheduling, and completed lessons can't be revisited. This is pedagogically sound but frustrating for power users who want more control. We should let people transparently step off the guided path when they choose to.

## Three Features

### 1. Unlock Future Lessons on Click

**Current behavior:** Clicking a locked lesson does nothing (`disabled={!available || completed}` in `LearnTab.tsx:56`). Locking is enforced by `isLessonAvailable()` in `lesson.ts:3-16` — it checks that the previous lesson is complete and no birds are in relearning state.

**New behavior:** Clicking a locked lesson shows a confirmation dialog explaining *why* it's locked and offering to unlock it anyway. Unlocking auto-completes all skipped lessons between the last completed lesson and the selected one.

**Implementation:**

- **LearnTab.tsx:** Remove `disabled` from locked lessons. On click of a locked lesson, instead of launching `LearnSession`, show a modal/dialog.
  - Dialog copy varies by lock reason:
    - *Previous lesson not complete:* "This lesson is locked so you don't learn too many birds at once. Want to unlock it anyway?"
    - *Birds in relearning:* "Some birds need more practice before new lessons. Want to skip ahead anyway?"
  - "Unlock" button calls `introduceSpecies()` for all skipped lessons' species, then sets `activeLesson` and launches `LearnSession`.
  - "Never mind" dismisses the dialog.
- **LearnSession.tsx:** No changes needed — it already works with any `Lesson` object regardless of lock state.
- **lesson.ts:** No changes. Locking logic stays intact; the UI bypasses the gate. This keeps `isLessonAvailable()` useful for determining *why* something is locked (for the dialog copy) and for tests.

**Auto-completion of skipped lessons:** When a user unlocks Lesson 4, Lessons 2 and 3 are auto-completed — their species are marked `introduced: true` and enter the FSRS review pool immediately as due. This means:
- Skipped birds appear as both quiz targets and distractors right away.
- If the user doesn't actually know those birds, FSRS will catch it (wrong answers trigger relearning). The system self-corrects.
- We trust the user's implicit claim that they already know the earlier birds.

**New component:** `UnlockDialog` — a small confirmation modal. Receives `reason: 'prerequisites' | 'relearning'` and `onConfirm`/`onDismiss` callbacks.

---

### 2. Practice When Nothing Is Due

**Current behavior:** When no birds are due for review, `QuizTab.tsx:53-68` shows "No birds due for review right now" and either a relearning warning or a "Learn More Birds" button. There's no way to practice.

**New behavior:** Always show a "Practice Anyway" option, with a gentle nudge that it may have diminishing returns.

**Implementation:**

- **QuizTab.tsx:** In the `dueForReview.length === 0` branch, replace the "Learn More Birds" button with two elements:
  1. A message: "No birds are due right now. Practicing too much may have diminishing returns, but you can practice anyway."
  2. A "Practice Anyway" button that launches a quiz session in practice mode.
  - Keep the "Learn More Birds" button as a secondary option below if there are unlearned lessons remaining.
  - If relearning birds exist, still show the relearning message but *also* show "Practice Anyway".

- **quiz.ts `buildQuizSession()`:** No changes needed — the existing padding logic already builds an 8-question session from introduced birds when 0 are due.

- **QuizSession.tsx:** Accept a `practiceMode?: boolean` prop. When `practiceMode` is true, **skip all `scheduleReview()` calls**. The session is fully FSRS-inert — no scheduling updates, no stability changes, no relearning triggers. It's a pure listening/recognition exercise.

**Rationale for FSRS-inert practice:** FSRS is designed around spaced intervals. Cramming data pollutes the model. This matches Anki's own pattern — their filtered/cram decks have a "Reschedule cards based on my answers" toggle, and the recommendation for cram sessions is to turn rescheduling off (Anki calls this "preview mode").

**Edge case:** If only 1-2 birds are introduced, distractor pools are very small. `buildQuizSession` already handles this gracefully (falls back to whatever is available), so no special handling needed.

---

### 3. Redo a Completed Lesson

**Current behavior:** Completed lessons show a green checkmark and are disabled (`disabled={!available || completed}` in `LearnTab.tsx:56`). Users cannot revisit the cards or hear the birds again.

**New behavior:** Clicking a completed lesson re-launches the lesson — same cards, same audio, same intro quiz — but without re-running `introduceSpecies()`.

**Implementation:**

- **LearnTab.tsx:** Remove `completed` from the disabled condition. Completed lessons become clickable. On click of a completed lesson, launch `LearnSession` with a `redo` flag.

- **LearnSession.tsx:** Accept an optional `redo?: boolean` prop.
  - When `redo` is true:
    - Skip the review warm-up phase (they're choosing to study specific birds, not warm up).
    - Show cards phase as normal (primary value — re-hearing the birds).
    - Show the intro quiz as normal (valuable "did I re-absorb this?" check; user can back out if they don't want it).
    - On quiz complete: do NOT call `introduceSpecies()` (already introduced). Show a "Nice refresher!" completion screen instead of "Lesson Complete! You've learned..."
  - Early exit (Back button) behavior: identical to normal lessons — return to lesson list, no side effects. Harmless in both modes since redo has no state to corrupt.

- **lesson.ts:** No changes.

---

## Design Decisions (resolved)

| Decision | Resolution | Rationale |
|----------|-----------|-----------|
| Auto-unlock vs auto-complete skipped lessons | Auto-complete (introduce species) | Unlocking without introducing doesn't help — birds need to be in the pool. Trust the user knows them; FSRS self-corrects if they don't. |
| Practice Anyway + FSRS | Fully FSRS-inert | Cramming pollutes FSRS stability scores. Matches Anki's "preview mode" for cram decks. |
| Redo: skip intro quiz? | Keep it | Adds value as a re-absorption check. User can bail via Back button if they don't want it. |
| Shared confirmation component? | No — keep separate | Unlock dialog is a modal, practice-anyway is inline copy, redo completion is a different screen title. Different enough to not warrant abstraction. |
| Skipped species as targets or distractors only? | Both | No gaming risk — quiz code already mixes lesson birds into both roles. Target/distractor is an internal role, not user-visible. |
| Back button behavior during redo | Same as normal | No side effects in either mode. Back means back. |

## Shared UX Considerations

- **Transparent friction:** Each feature tells the user *why* the guardrail exists before letting them bypass it. The goal is informed choice, not hidden options.
- **No settings/preferences:** These are point-of-use decisions, not global toggles. Keep the default path guided.
- **Self-correcting:** The only permanent state change is auto-completing skipped lessons. If the user was wrong about knowing those birds, FSRS catches it through normal review. Practice-anyway and redo have zero persistent side effects.

## Files Changed

| File | Change |
|------|--------|
| `beakspeak/src/components/learn/LearnTab.tsx` | Remove disabled on locked/completed, add unlock dialog and redo mode |
| `beakspeak/src/components/learn/LearnSession.tsx` | Add `redo` prop, skip review phase and `introduceSpecies` on redo |
| `beakspeak/src/components/quiz/QuizTab.tsx` | Add "Practice Anyway" button and inline copy when nothing due |
| `beakspeak/src/components/quiz/QuizSession.tsx` | Add `practiceMode` prop, skip `scheduleReview()` when true |
| `beakspeak/src/components/learn/UnlockDialog.tsx` | **New** — confirmation modal for unlocking lessons |

## Files NOT Changed

| File | Why |
|------|-----|
| `beakspeak/src/core/lesson.ts` | Locking logic stays; UI bypasses the gate |
| `beakspeak/src/core/quiz.ts` | Padding logic already handles 0-due sessions |
| `beakspeak/src/core/fsrs.ts` | Not touched; practice mode skips it entirely |
| `beakspeak/src/store/appStore.ts` | No new persistent state needed |

## Order of Implementation

1. **UnlockDialog component + LearnTab unlock flow** — includes auto-completing skipped lessons
2. **Redo lessons** — LearnTab clickability + LearnSession `redo` prop
3. **Practice anyway** — QuizTab inline copy + QuizSession `practiceMode` prop
