# Unlockable Guided Path

**Date:** 2026-04-22
**Status:** Final

## Problem

The default learning experience is intentionally guided: lessons unlock sequentially, reviews follow FSRS scheduling, and completed lessons cannot be revisited. This is pedagogically sound but frustrating for power users who want more control. We should let people transparently step off the guided path when they choose to, while keeping the guided path as the default.

## Three Features

### 1. Unlock Future Lessons on Click

**Current behavior:** Clicking a locked lesson does nothing because locked lessons are disabled in `LearnTab.tsx`. Locking is enforced by `isLessonAvailable()` in `lesson.ts`, which blocks a lesson if the previous lesson is incomplete or any bird is in relearning.

**New behavior:** Clicking a locked lesson opens a confirmation modal that explains why the lesson is locked and what bypassing the guardrail will do. Confirming the modal immediately marks skipped lessons as learned, then launches the selected lesson in unlock mode.

**Implementation:**

- **LearnTab.tsx**
  - Remove the disabled behavior for locked lessons.
  - Clicking a locked lesson opens `UnlockDialog` instead of launching the lesson directly.
  - Maintain explicit local launch state for lessons, e.g. `{ lesson, mode: 'normal' | 'unlock' | 'redo' }`.
  - Confirmation is a one-launch bypass only. If the user backs out of the launched lesson and the guardrail still applies later, they must confirm again.
  - Auto-complete only the skipped intervening lessons, not the selected lesson itself.
  - Mark skipped lessons learned immediately on confirmation, not at the end of the selected lesson.
  - Preserve any existing progress for skipped species and only fill in missing introductions.

- **UnlockDialog.tsx**
  - Use a true modal, not inline expansion.
  - Allow both outside-tap dismissal and an explicit `Never mind` button.
  - Use reason-specific titles:
    - `Take It Step by Step` for missing prerequisites
    - `Practice First` for relearning
  - Lead with the rationale first, then the consequence.
  - Use reason-specific primary CTAs:
    - `Skip Ahead Anyway` for prerequisite-only locks
    - `Open Lesson Anyway` for relearning locks
    - If both reasons apply, use the relearning framing and `Open Lesson Anyway`
  - When skipped lessons will be marked learned, explicitly name the lesson numbers and bird count if small and deterministic:
    - List exact lesson numbers when at most 3 lessons are skipped
    - Otherwise summarize as a range
  - If no lessons will be auto-completed, use copy that explicitly says the lesson will open now but nothing will be marked learned unless the lesson is completed.
  - Use user-facing language like “those birds will start showing up in your reviews,” not internal terms like “review pool.”

- **LearnSession.tsx**
  - Accept a single explicit `mode: 'normal' | 'unlock' | 'redo'` prop.
  - `unlock` mode skips the review warm-up.
  - `unlock` mode otherwise behaves like a normal lesson: cards, intro quiz, then introduce the selected lesson species on completion.

- **core/lesson.ts**
  - Add a helper that returns the structured lock reason, with relearning taking precedence over prerequisites.
  - Keep `isLessonAvailable()` and have it delegate to the new helper.
  - Do not move unlock modal consequence formatting into core; keep that in the learn UI layer.

**Auto-completion of skipped lessons:** When a user unlocks Lesson 4, Lessons 2 and 3 are auto-completed immediately on confirmation. Their species are marked `introduced: true` and will appear in normal review generation right away as both quiz targets and distractors. If the user does not actually know those birds, the normal review system will surface that.

---

### 2. Practice When Nothing Is Due

**Current behavior:** When no birds are due for review, `QuizTab.tsx` shows a dead-end empty state with either a relearning warning or a `Learn More Birds` button. There is no way to practice.

**New behavior:** When nothing is due and the user has learned enough birds to make practice meaningful, offer a `Practice Anyway` path that is completely side-effect-free.

**Implementation:**

- **QuizTab.tsx**
  - Keep the practice-availability rule in `QuizTab`, not in core.
  - Show `Practice Anyway` only when:
    - no birds are due, and
    - at least 3 birds have been introduced
  - CTA hierarchy when practice is available:
    - If unlearned lessons remain and the guided path is actually available, keep `Learn More Birds` as the primary CTA and `Practice Anyway` as the secondary CTA.
    - If relearning birds exist and block the guided path, show the relearning message and make `Practice Anyway` the only actionable CTA.
    - If all lessons are complete, show only `Practice Anyway`.
  - Do not offer `Practice Anyway` alongside `Start Review` when birds are due.

- **QuizSession.tsx**
  - Accept a single explicit `mode: 'review' | 'practice'` prop.
  - `practice` mode reuses the normal quiz mix, including `same_different` for higher-rep birds.
  - `practice` mode skips all persistent side effects:
    - no `scheduleReview()`
    - no confusion logging
  - Keep the existing top header row and `Quit` label.
  - Add a small inline label beneath the header in practice mode:
    - Title: `Practice Session`
    - Subcopy: `This won't change your review schedule`

- **QuizResult.tsx**
  - Derive mode-specific copy from the `mode` prop internally.
  - In practice mode, explicitly state that the session did not change the review schedule.
  - Keep the existing `Needs More Practice` heading for incorrect birds.

- **core/quiz.ts**
  - No special practice-mode logic needed.
  - Practice reuses the same quiz construction as review mode.

**Rationale for FSRS-inert practice:** FSRS is designed around spaced intervals. Cramming data pollutes the model. Practice here is a preview-style session, not a scheduling event.

**Edge case:** If fewer than 3 birds are introduced, do not offer `Practice Anyway`. The current quiz builder can technically limp along with fewer choices, but the result is too weak to be worth presenting as a real practice mode.

---

### 3. Redo a Completed Lesson

**Current behavior:** Completed lessons show a green checkmark and are disabled. Users cannot revisit the cards or hear the birds again.

**New behavior:** Clicking a completed lesson launches that lesson again in redo mode. Redo exists for refresher study, not for changing review state.

**Implementation:**

- **LearnTab.tsx**
  - Remove the disabled behavior for completed lessons.
  - Completed lessons remain visually distinct via their existing success styling, but do not need extra `Redo` labels or badges.
  - Clicking a completed lesson launches `LearnSession` in `redo` mode immediately, even if birds are currently in relearning.

- **LearnSession.tsx**
  - `redo` mode skips the review warm-up.
  - `redo` mode still shows:
    - cards
    - audio
    - intro quiz
  - `redo` mode does not call `introduceSpecies()` on completion, because completed lessons already have introduced species.
  - `redo` mode is scheduling-neutral. It is a refresher, not a review session.
  - The completion screen should say both:
    - that it was a refresher
    - that the review schedule was not changed
  - The primary completion button in redo mode should be `Back to Lessons`.
  - Normal and unlock lesson completions should keep `Continue`.

- **IntroQuiz.tsx**
  - Add an optional `onBack` prop.
  - When present, render a top-left `Back` link internally.
  - Use this `Back` link for all `LearnSession` quiz flows, not only redo.
  - In lesson quiz flows, `Back` always exits the lesson session back to the lesson list. It does not mean “skip this quiz and continue.”

---

## Design Decisions (resolved)

| Decision | Resolution | Rationale |
|----------|-----------|-----------|
| Unlock skipped lessons vs auto-complete them | Auto-complete skipped intervening lessons | Unlocking without introducing species does not help; birds need to enter the normal learning pool. |
| When to mark skipped lessons learned | Immediately on confirmation | Unlocking is the state-changing act. The dialog should be truthful at the moment of confirmation. |
| Does selected lesson auto-complete on unlock | No | Only intervening lessons are auto-completed; the selected lesson still runs normally. |
| Preserve or reset existing skipped-bird progress | Preserve existing progress | Do not destroy legitimate history for already-introduced species. |
| Relearning vs prerequisites precedence | Relearning wins | It is the stronger guardrail and should control the reason shown. |
| Manual unlock persistence | One-launch only | Avoid storing “manually unlocked” state; keep bypasses explicit and local. |
| Unlock modal dismissal | Outside tap and `Never mind` | Dismissal is harmless; confirmation remains explicit. |
| Unlock modal titles | Reason-specific explanatory titles | Titles explain the guardrail; buttons carry the override. |
| Prerequisite title | `Take It Step by Step` | Pedagogical framing fits the product voice. |
| Relearning title | `Practice First` | Short, clear, mobile-friendly. |
| Unlock modal button labels | `Skip Ahead Anyway` or `Open Lesson Anyway` | More truthful than a generic “Unlock.” |
| Unlock modal consequence copy | Explicit lesson numbers and bird counts when small/deterministic | Makes the cost of skipping legible. |
| Exact lesson-number cutoff | List exact lessons up to 3 skipped lessons | Beyond that, summarize as a range. |
| LearnSession mode shape | Single `mode` prop | Clearer than stacking booleans for normal/unlock/redo. |
| LearnSession mode type location | Local to component | These are UI flow semantics, not domain types. |
| LearnSession copy ownership | Inside `LearnSession` | Copy is tightly coupled to mode-specific behavior. |
| Warm-up in unlock mode | Skip it | Unlock should open the selected lesson directly. |
| Warm-up in redo mode | Skip it | Redo is targeted refresher study, not warm-up. |
| Redo intro quiz | Keep it | Still useful as a re-absorption check. |
| Redo scheduling | Fully inert | Redo is refresher study, not review. |
| Redo availability during relearning | Allow it | Relearning should block new lessons, not extra exposure to known birds. |
| Lesson-quiz `Back` behavior | Exit lesson session | Keep `Back` semantics consistent across lesson flows. |
| IntroQuiz back-header ownership | `IntroQuiz` via optional `onBack` | Keeps one screen’s chrome inside one component. |
| Practice availability threshold | Require at least 3 introduced birds | Avoid weak/trivial sessions with too few choices. |
| Practice availability when due birds exist | Do not show it | Keep the scheduled review path primary. |
| Practice availability when relearning blocks learning | Show relearning message plus only `Practice Anyway` | Avoid a false `Learn More Birds` CTA. |
| Practice availability when all lessons complete | Show only `Practice Anyway` | `Learn More Birds` is no longer truthful. |
| Practice CTA hierarchy when guided path is available | `Learn More Birds` primary, `Practice Anyway` secondary | Nudge toward the guided path without removing the bypass. |
| Practice session side effects | None | No scheduling updates and no confusion logging. |
| Practice session quiz mix | Reuse normal review mix | Practice should be inert, not pedagogically different. |
| Practice session labeling | Label in-session and in results | Set expectations before and after the session. |
| Practice-mode header layout | Keep existing header, add label beneath | Preserve the established session chrome. |
| Practice-mode result heading | Keep `Needs More Practice` | Simpler UI logic; difference is carried by the schedule disclaimer. |
| QuizSession mode shape | Single `mode` prop | Same reasoning as LearnSession: explicit semantics beat booleans. |
| QuizSession mode type location | Local to component | UI flow concern, not domain type. |
| QuizResult copy ownership | Inside `QuizResult` | Keep mode-specific rendering logic with the component that owns it. |
| QuizSession exit label in practice mode | Keep `Quit` | Consistent with normal quiz session chrome. |
| Lock-reason helper location | `core/lesson.ts` | Lock reason is domain logic and should be testable. |
| Unlock-copy consequence helper location | Local helper in `learn/` | UI formatting rules do not belong in core. |
| `isLessonAvailable()` fate | Keep it and delegate | Minimizes churn while enabling richer callers. |
| Required tests | Test pure logic plus highest-risk branch behavior | Good regression protection without over-investing in UI test volume. |

## Shared UX Considerations

- **Transparent friction:** Explain the guardrail first, then explain the consequence of bypassing it.
- **Guided path remains the default:** The bypasses are point-of-use decisions, not global settings or preferences.
- **Only one durable bypass side effect:** Unlocking ahead can mark skipped lessons learned immediately. Practice and redo are both side-effect-free.
- **Consistent session semantics:** `Back` exits lesson study; `Quit` exits quiz sessions; warm-up exists only for normal lesson launches.

## Module Design

### LearnTab

- **Name:** `LearnTab`
- **Responsibility:** Own lesson-list interaction and route each lesson click into normal, unlock, or redo study flow.
- **Interface:** Reads manifest/progress-derived lesson state from the store; computes lesson availability/completion; launches `LearnSession` with `{ lesson, mode }`; opens and dismisses `UnlockDialog`; applies skipped-lesson auto-completion on unlock confirmation while preserving existing progress.
- **Tested:** Yes

### UnlockDialog

- **Name:** `UnlockDialog`
- **Responsibility:** Present the locked-lesson guardrail explanation and the exact consequences of bypassing it, then collect an explicit confirm or cancel decision.
- **Interface:** Accepts structured lock reason plus precomputed consequence copy inputs from the learn UI layer; renders reason-specific title/body/CTA; exposes confirm and dismiss callbacks; does not mutate state directly.
- **Tested:** Yes

### Unlock Consequence Copy Helper

- **Name:** `unlock consequence copy helper`
- **Responsibility:** Convert skipped-lesson context into user-facing modal copy without leaking UI formatting rules into core lesson logic.
- **Interface:** Accepts skipped lessons/species counts and returns consequence text fragments for the dialog, including exact lesson lists for small skips and range summaries for larger skips.
- **Tested:** Yes

### LearnSession

- **Name:** `LearnSession`
- **Responsibility:** Run a lesson session from start to finish in `normal`, `unlock`, or `redo` mode.
- **Interface:** Accepts `lesson`, `mode`, and `onComplete`; decides whether to show warm-up, cards, intro quiz, and completion state; introduces selected lesson species only in `normal` and `unlock`; keeps redo side-effect-free apart from local session state.
- **Tested:** Yes

### IntroQuiz

- **Name:** `IntroQuiz`
- **Responsibility:** Render the lesson quiz experience and optionally own the lesson-flow back navigation chrome.
- **Interface:** Accepts quiz items, `onComplete`, and optional `onBack`; when `onBack` is present it renders a top-left `Back` action that exits the lesson session rather than skipping quiz progress.
- **Tested:** Yes

### QuizTab

- **Name:** `QuizTab`
- **Responsibility:** Decide whether the user should see review, practice, learning, or relearning empty-state actions when opening the quiz tab.
- **Interface:** Reads introduced species, due reviews, relearning state, lesson availability context, and completion context from the store; launches `QuizSession` with `review` or `practice` mode; routes to Learn when that is the truthful primary action.
- **Tested:** Yes

### QuizSession

- **Name:** `QuizSession`
- **Responsibility:** Run a review or practice quiz session while applying the correct side-effect model for the selected mode.
- **Interface:** Accepts `mode` and `onComplete`; builds quiz items using existing quiz construction; in `review` mode schedules progress updates and confusion logging; in `practice` mode suppresses persistent writes and adds in-session schedule-neutral labeling.
- **Tested:** Yes

### QuizResult

- **Name:** `QuizResult`
- **Responsibility:** Summarize quiz outcomes with copy that matches the session mode.
- **Interface:** Accepts session answers, mode, and done callback; renders existing success/failure result states plus explicit schedule-neutral disclaimer text in practice mode.
- **Tested:** Yes

### core/lesson lock-reason helper

- **Name:** `lock reason helper`
- **Responsibility:** Centralize lesson-lock domain logic and expose structured reason data to richer callers.
- **Interface:** Accepts lesson number, completed lesson numbers, and all progress; returns a structured reason that distinguishes prerequisite lock vs relearning lock, with relearning taking precedence; `isLessonAvailable()` delegates to this helper.
- **Tested:** Yes

## Files Changed

| File | Change |
|------|--------|
| `beakspeak/src/components/learn/LearnTab.tsx` | Unlock modal flow, explicit lesson launch state, normal/unlock/redo launch routing |
| `beakspeak/src/components/learn/LearnSession.tsx` | Single `mode` prop, skip warm-up for unlock/redo, redo-specific completion copy |
| `beakspeak/src/components/learn/IntroQuiz.tsx` | Optional `onBack` prop and internal lesson-quiz header |
| `beakspeak/src/components/learn/UnlockDialog.tsx` | New modal component for locked-lesson bypass flow |
| `beakspeak/src/components/learn/*` | Small local helper for unlock modal copy assembly |
| `beakspeak/src/components/quiz/QuizTab.tsx` | Practice CTA gating and empty-state branching |
| `beakspeak/src/components/quiz/QuizSession.tsx` | Single `mode` prop, practice labeling, skip persistent side effects in practice |
| `beakspeak/src/components/quiz/QuizResult.tsx` | Mode-derived copy, explicit practice disclaimer |
| `beakspeak/src/core/lesson.ts` | New structured lock-reason helper; `isLessonAvailable()` delegates |
| `beakspeak/src/core/lesson.test.ts` | Tests for lock-reason precedence and related pure logic |
| `beakspeak/src/components/*/*.test.tsx` | Focused tests for key UI branch behavior |

## Files NOT Changed

| File | Why |
|------|-----|
| `beakspeak/src/core/fsrs.ts` | FSRS behavior itself is unchanged; practice/redo avoid touching it |
| `beakspeak/src/core/quiz.ts` | Practice reuses normal quiz construction |
| `beakspeak/src/store/appStore.ts` | No new persistent “manual unlock” or session-mode state is needed |
| `beakspeak/src/core/types.ts` | Session modes stay local to UI components |

## Testing Plan

### LearnTab

- Add component tests for clicking an available incomplete lesson, a locked lesson, and a completed lesson.
- Verify locked lessons no longer use disabled button behavior and instead open `UnlockDialog`.
- Verify completed lessons launch redo mode even when relearning exists.
- Verify unlock confirmation auto-completes only skipped intervening lessons and preserves existing progress on already-introduced species.

### UnlockDialog

- Add component tests for prerequisite-only, relearning-only, and combined lock reasons.
- Verify title, CTA label, dismissal controls, and consequence copy all match the resolved reason.
- Verify outside-dismiss and `Never mind` both close the modal without mutating progress.

### Unlock Consequence Copy Helper

- Add pure tests for exact lesson list formatting when skipping up to 3 lessons.
- Add pure tests for range summary formatting when skipping more than 3 lessons.
- Add pure tests for the zero-auto-complete case where the lesson opens but nothing is marked learned yet.

### LearnSession

- Add component tests for `normal`, `unlock`, and `redo` mode phase progression.
- Verify warm-up appears only in `normal` mode and is skipped in `unlock` and `redo`.
- Verify `introduceSpecies()` is called on completion for `normal` and `unlock`, but not for `redo`.
- Verify redo completion copy and primary button label are schedule-neutral and lesson-specific.

### IntroQuiz

- Add component tests for the optional `onBack` prop.
- Verify the header `Back` action renders only when `onBack` is provided.
- Verify `Back` exits the lesson flow rather than advancing or bypassing the quiz.

### QuizTab

- Add component tests for all empty-state branches:
  - due birds available
  - no birds introduced
  - no birds due but guided path available
  - no birds due and relearning blocks learning
  - no birds due and all lessons complete
  - fewer than 3 introduced birds
- Verify `Practice Anyway` is never shown when due birds exist.
- Verify CTA hierarchy remains `Learn More Birds` primary and `Practice Anyway` secondary when both are valid.

### QuizSession

- Add component tests for `review` and `practice` mode.
- Verify `practice` mode reuses the existing quiz mix but performs no persistent writes.
- Verify `review` mode still calls scheduling and confusion logging exactly as before.
- Verify practice-mode header labeling is present and the exit label remains `Quit`.

### QuizResult

- Add component tests for practice-mode result copy.
- Verify the practice result explicitly states that the schedule was not changed.
- Verify the existing incorrect-answer heading `Needs More Practice` remains unchanged across modes.

### core/lesson lock-reason helper

- Add unit tests for prerequisite-only lock, relearning-only lock, and combined conditions.
- Verify relearning takes precedence over prerequisites.
- Verify lesson 1 remains available when no relearning birds exist.
- Verify `isLessonAvailable()` still returns the correct boolean when delegating to the structured helper.

### Regression Scope

- Run `cd beakspeak && npm run typecheck`.
- Run `cd beakspeak && npm run lint`.
- Run targeted unit/component tests while iterating, then the relevant unit suite before finishing.
- Do not run E2E by default for this plan unless the implementation introduces browser-only regressions that unit/component tests cannot cover cleanly.

## Order of Implementation

1. **Lock reason + unlock flow**
   Update `core/lesson.ts`, add `UnlockDialog`, add local unlock-copy helper, wire locked-lesson modal flow in `LearnTab`.
2. **Lesson session modes**
   Convert `LearnSession` to explicit `mode`, add redo/unlock warm-up behavior, update `IntroQuiz` with optional `onBack`.
3. **Practice mode**
   Add `QuizSession` mode, side-effect-free practice behavior, in-session/results labeling, and updated `QuizTab` empty-state branching.
4. **Tests**
   Add unit tests for pure lock-reason logic and focused component tests for the high-risk new branches.
