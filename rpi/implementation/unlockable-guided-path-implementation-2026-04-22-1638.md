# Unlockable Guided Path Implementation Issues

Parent PRD: `rpi/plans/2026-04-22-unlockable-guided-path.md`

## Derived User Story Index

The parent PRD does not include a numbered `User Stories` section. For issue cross-references, use the following derived story index:

1. Locked lesson explanation: As a learner, I want clicking a locked lesson to explain why it is locked, so that the guided path feels intentional instead of arbitrary.
2. Explicit skip-ahead bypass: As a learner, I want to explicitly bypass the guided path for a future lesson, so that I can study ahead when I choose to.
3. Transparent unlock consequences: As a learner, I want to see the concrete consequences of skipping ahead before I confirm, so that I understand what state will change.
4. Preserve skipped-bird history: As a learner, I want skipped intervening lessons to be introduced without wiping existing progress, so that bypassing the path does not destroy legitimate history.
5. Side-effect-free practice: As a learner, I want to practice when nothing is due, so that I can keep studying without changing my FSRS schedule.
6. Truthful empty states around practice: As a learner, I want the quiz tab to offer truthful next actions when relearning blocks learning or all lessons are complete, so that the UI never dead-ends me misleadingly.
7. Redo completed lessons: As a learner, I want to reopen a completed lesson as a refresher, so that I can revisit cards and audio without changing review state.
8. Consistent lesson-flow back navigation: As a learner, I want `Back` in lesson quiz flows to return me to the lesson list, so that lesson navigation stays predictable.

## Dependency Graph

```text
Issue 1 (locked-lesson explanation) -> Issue 2 (skip-ahead confirmation and launch)

Issue 3 (redo completed lessons) can start immediately
Issue 4 (practice anyway) can start immediately
```

---

## Issue 1: Explain locked lessons before bypass

**Type**: AFK
**Blocked by**: None — can start immediately

### Parent PRD

`rpi/plans/2026-04-22-unlockable-guided-path.md`

### What to build

Build the first end-to-end slice of the unlock flow: when the user taps a locked lesson in Learn, the app should open a true modal that explains the active guardrail and the consequences of bypassing it, instead of silently doing nothing.

This slice includes the structured lesson-lock reason from the PRD's "Unlock Future Lessons on Click" and "Module Design" sections, the `UnlockDialog` UI, and the local learn-layer helper that assembles user-facing consequence copy. It does not yet need to mutate progress or launch the selected lesson after confirmation; the goal of this slice is to make the guardrail legible and dismissible.

### How to verify

- **Manual**:
  1. Open Learn with at least one locked lesson.
  2. Tap a locked lesson.
  3. Verify a modal appears instead of no-op button behavior.
  4. Verify prerequisite locks use `Take It Step by Step` and relearning locks use `Practice First`.
  5. Verify the modal can be dismissed by outside tap and by `Never mind`.
- **Automated**:
  - Unit tests assert the core lock-reason helper distinguishes prerequisite vs relearning locks and gives relearning precedence.
  - Component tests assert `LearnTab` opens `UnlockDialog` for locked lessons.
  - Component tests assert dialog title, CTA label, and dismiss controls match the resolved reason.

### Acceptance criteria

- [ ] Given a locked lesson caused by missing prerequisites, when the user taps it, then a modal opens with prerequisite-specific explanation instead of the button doing nothing.
- [ ] Given a locked lesson caused by relearning, when the user taps it, then the modal uses relearning framing and does not show prerequisite-first copy.
- [ ] Given a locked lesson with both prerequisite and relearning conditions, when the dialog opens, then relearning takes precedence.
- [ ] Given the unlock dialog is open, when the user taps outside it or chooses `Never mind`, then the modal closes and no progress is changed.

### User stories addressed

- User story 1: Locked lesson explanation
- User story 3: Transparent unlock consequences

### Tasks

#### 1.1. Add structured lesson lock reasons in `core/lesson.ts`

- [x] Task complete

**Type**: WRITE  
**Output**: `beakspeak/src/core/lesson.ts` exposes a structured lock-reason helper and `isLessonAvailable()` delegates to it.  
**Depends on**: none

Update [lesson.ts](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/core/lesson.ts) to return explicit lock-reason data for prerequisite locks versus relearning locks, with relearning taking precedence. Keep the helper pure and shaped for UI callers in Learn. Preserve the existing boolean `isLessonAvailable()` API by delegating through the new helper instead of duplicating logic.

#### 1.2. Cover the lock-reason helper with unit tests

- [x] Task complete

**Type**: TEST  
**Output**: `beakspeak/src/core/lesson.test.ts` covers prerequisite, relearning, and precedence behavior.  
**Depends on**: 1.1

Extend [lesson.test.ts](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/core/lesson.test.ts) using the existing pure-function test style already in that file. Add focused cases for prerequisite-only locks, relearning-only locks, combined conditions, lesson-1 availability, and the delegated `isLessonAvailable()` boolean.

#### 1.3. Create the unlock dialog and consequence copy helper

- [x] Task complete

**Type**: WRITE  
**Output**: `UnlockDialog` and a local learn-layer copy helper exist and render reason-specific explanatory copy without mutating progress.  
**Depends on**: 1.1

Create a new learn UI modal component and its small local consequence-copy helper under `beakspeak/src/components/learn/`. Follow the visual and copy patterns already used in [LearnSession.tsx](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/components/learn/LearnSession.tsx) and [IntroQuiz.tsx](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/components/learn/IntroQuiz.tsx): true modal presentation, explicit primary/secondary actions, and copy that stays in the UI layer rather than moving formatting rules into core.

#### 1.4. Wire locked lessons in `LearnTab` to open and dismiss the dialog

- [x] Task complete

**Type**: WRITE  
**Output**: Tapping a locked lesson in Learn opens `UnlockDialog` and dismissing it leaves progress unchanged.  
**Depends on**: 1.3

Update [LearnTab.tsx](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/components/learn/LearnTab.tsx) so locked lessons no longer fail silently. Keep completed lessons behaving as they do now in this slice; only replace the locked-lesson no-op with modal open/dismiss state, using the new helper and dialog component.

#### 1.5. Add component tests for locked-lesson dialog behavior

- [x] Task complete

**Type**: TEST  
**Output**: A learn component test file verifies locked lessons open the modal with reason-specific copy and dismiss cleanly.  
**Depends on**: 1.2, 1.4

Add or extend a learn component test file near the affected components and follow the React Testing Library patterns already present in [BirdCard.test.tsx](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/components/learn/BirdCard.test.tsx). Cover tapping a locked lesson, prerequisite versus relearning copy, and dismissal without side effects.

---

## Issue 2: Confirm skip-ahead unlock and launch the lesson

**Type**: AFK
**Blocked by**: Issue 1

### Parent PRD

`rpi/plans/2026-04-22-unlockable-guided-path.md`

### What to build

Complete the skip-ahead flow so that confirming the unlock dialog immediately introduces skipped intervening lessons, preserves any existing per-species history, and then launches the selected lesson in `unlock` mode.

This slice covers the end-to-end behavior described in the PRD's "Unlock Future Lessons on Click" feature: explicit local launch state in `LearnTab`, one-launch-only bypass semantics, skipped-lesson auto-completion on confirmation, and `LearnSession` support for `unlock` mode so the selected lesson opens directly into cards and intro quiz without the normal review warm-up.

### How to verify

- **Manual**:
  1. Set up progress so Lesson 1 is complete and Lesson 3 or later is locked.
  2. Tap the locked lesson and confirm the bypass.
  3. Verify skipped intervening lessons are marked learned immediately.
  4. Verify the selected lesson opens directly without the review warm-up.
  5. Exit the launched lesson and tap the same locked lesson again while the guardrail still applies.
  6. Verify confirmation is required again and no persistent "manually unlocked" state exists.
- **Automated**:
  - Component tests assert unlock confirmation marks only skipped intervening lessons as introduced.
  - Component tests assert existing introduced progress for skipped species is preserved rather than overwritten.
  - Component tests assert `LearnSession` in `unlock` mode skips warm-up and still introduces the selected lesson species on completion.

### Acceptance criteria

- [ ] Given a locked future lesson with skipped intervening lessons, when the user confirms the bypass, then only the skipped intervening lessons are marked learned immediately.
- [ ] Given skipped lessons include species with existing progress, when unlock confirmation runs, then missing introductions are filled in without wiping legitimate history.
- [ ] Given the user confirms a locked lesson, when the lesson launches, then it starts in `unlock` mode and skips the review warm-up.
- [ ] Given the user backs out of an unlock-launched lesson, when they later tap the locked lesson again while the guardrail still applies, then they must confirm the bypass again.

### User stories addressed

- User story 2: Explicit skip-ahead bypass
- User story 4: Preserve skipped-bird history

### Tasks

#### 2.1. Add skip-ahead confirmation state changes in `LearnTab`

- [x] Task complete

**Type**: WRITE  
**Output**: Confirming the unlock dialog immediately introduces skipped intervening lessons while preserving existing progress records.  
**Depends on**: 1.4

Update [LearnTab.tsx](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/components/learn/LearnTab.tsx) to compute skipped intervening lessons from the manifest lesson plan and to call the existing store progress APIs in a way that preserves legitimate history. Use [appStore.ts](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/store/appStore.ts) as the contract reference: fill in missing introductions without resetting reps, state, or review timestamps for already-introduced species.

#### 2.2. Convert `LearnSession` to explicit launch modes and implement `unlock`

- [x] Task complete

**Type**: WRITE  
**Output**: `LearnSession` accepts an explicit `mode` prop and `unlock` mode skips warm-up while otherwise completing like a normal lesson.  
**Depends on**: 2.1

Refactor [LearnSession.tsx](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/components/learn/LearnSession.tsx) so launch semantics are driven by one explicit mode instead of implicit conditions. Keep the current cards and intro quiz flow, skip the review warm-up only in `unlock`, and preserve the normal completion behavior of introducing the selected lesson species once the lesson is actually finished.

#### 2.3. Launch confirmed unlocks into `LearnSession` with one-launch-only semantics

- [x] Task complete

**Type**: WRITE  
**Output**: `LearnTab` launches confirmed skip-ahead lessons in `unlock` mode and requires confirmation again after exiting.  
**Depends on**: 2.2

Finish the `LearnTab` integration by replacing the current single `activeLesson` state with explicit local launch state that carries both `lesson` and `mode`. Keep the bypass local to the current launch only; do not add persistent manual-unlock state to the store or types.

#### 2.4. Add tests for skip-ahead auto-completion and unlock mode

- [x] Task complete

**Type**: TEST  
**Output**: Learn tests cover skipped-lesson introduction rules and unlock-mode session behavior.  
**Depends on**: 2.3

Extend the learn component test coverage to verify that only skipped intervening lessons are introduced on confirmation, existing introduced progress is preserved, `unlock` mode skips warm-up, and backing out of the launched lesson does not create durable unlock state.

---

## Issue 3: Redo completed lessons as schedule-neutral refreshers

**Type**: AFK
**Blocked by**: None — can start immediately

### Parent PRD

`rpi/plans/2026-04-22-unlockable-guided-path.md`

### What to build

Implement the refresher-study path for completed lessons so that tapping a completed lesson launches it again in `redo` mode, with cards, audio, intro quiz, consistent lesson-flow back navigation, and completion copy that explicitly says the review schedule was not changed.

This slice covers the PRD's "Redo a Completed Lesson" feature across `LearnTab`, `LearnSession`, and `IntroQuiz`. It should preserve completed-lesson styling, allow redo even during relearning, keep redo fully scheduling-neutral, and make `Back` inside lesson quiz flows exit to the lesson list rather than skipping ahead.

### How to verify

- **Manual**:
  1. Complete a lesson.
  2. Tap the completed lesson from Learn.
  3. Verify it launches immediately in refresher flow even if another bird is in relearning.
  4. Step through cards and intro quiz.
  5. Use `Back` during the lesson quiz and verify it exits to the lesson list.
  6. Complete the redo flow and verify the completion screen says it was a refresher and did not change the review schedule.
- **Automated**:
  - Component tests assert completed lessons are clickable and launch `redo` mode.
  - Component tests assert `LearnSession` in `redo` mode skips warm-up and never calls `introduceSpecies()`.
  - Component tests assert `IntroQuiz` renders the optional `Back` control and routes it to lesson exit.

### Acceptance criteria

- [ ] Given a completed lesson, when the user taps it, then the lesson opens again in `redo` mode instead of remaining disabled.
- [ ] Given relearning birds exist, when the user taps a completed lesson, then redo still launches.
- [ ] Given the user completes a redo session, when the completion screen appears, then it states that the session was a refresher and that the review schedule was not changed.
- [ ] Given the lesson intro quiz is open, when the user taps `Back`, then the app exits the lesson flow to the lesson list rather than skipping quiz progress.

### User stories addressed

- User story 7: Redo completed lessons
- User story 8: Consistent lesson-flow back navigation

### Tasks

#### 3.1. Let completed lessons launch in `redo` mode from `LearnTab`

- [x] Task complete

**Type**: WRITE  
**Output**: Completed lessons remain visually complete but are clickable and launch redo mode even during relearning.  
**Depends on**: none

Update [LearnTab.tsx](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/components/learn/LearnTab.tsx) so completed lessons stop being disabled while retaining their existing success styling. Route completed-lesson clicks into explicit `redo` launch state and avoid letting relearning block this refresher path.

#### 3.2. Add `redo` behavior to `LearnSession`

- [x] Task complete

**Type**: WRITE  
**Output**: `LearnSession` supports `redo` mode with schedule-neutral completion copy and no `introduceSpecies()` call.  
**Depends on**: 3.1

Extend [LearnSession.tsx](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/components/learn/LearnSession.tsx) to handle `redo` as a first-class mode. Reuse the existing cards and intro quiz flow, skip warm-up, suppress progress introduction on completion, and update the completion content and button label to clearly describe a refresher that did not change the review schedule.

#### 3.3. Add lesson-quiz back navigation support to `IntroQuiz`

- [x] Task complete

**Type**: WRITE  
**Output**: `IntroQuiz` supports an optional `onBack` control that exits lesson study flows.  
**Depends on**: 3.2

Update [IntroQuiz.tsx](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/components/learn/IntroQuiz.tsx) to accept an optional `onBack` prop and render a consistent top-left `Back` action when present. Keep ownership of this header inside `IntroQuiz`, and make sure lesson sessions use it to exit back to the lesson list instead of skipping the quiz.

#### 3.4. Add component tests for redo and lesson-quiz back behavior

- [x] Task complete

**Type**: TEST  
**Output**: Learn tests cover completed-lesson redo launches, schedule-neutral completion, and `IntroQuiz` back behavior.  
**Depends on**: 3.3

Add or extend component tests around the learn flow to verify completed lessons launch redo mode, relearning does not block redo, `introduceSpecies()` is not called on redo completion, and the `Back` action inside lesson quiz flows returns to the lesson list.

---

## Issue 4: Practice anyway when no review is due

**Type**: AFK
**Blocked by**: None — can start immediately

### Parent PRD

`rpi/plans/2026-04-22-unlockable-guided-path.md`

### What to build

Add a fully side-effect-free practice path to the Quiz tab for times when no birds are due, while keeping the guided path truthful and primary whenever scheduled review or learning should still be the default next action.

This slice covers the PRD's "Practice When Nothing Is Due" feature across `QuizTab`, `QuizSession`, and `QuizResult`: practice availability gating at 3 introduced birds, correct CTA hierarchy across empty states, `practice` mode support in `QuizSession`, no scheduling updates or confusion logging in practice mode, and explicit in-session and result copy that the review schedule was not changed.

### How to verify

- **Manual**:
  1. Set up a state with at least 3 introduced birds and no birds due.
  2. Open Quiz and verify `Practice Anyway` appears only in the PRD-approved empty states.
  3. Start a practice session and finish it.
  4. Verify the header labels it as `Practice Session` and says the schedule will not change.
  5. Verify the result screen explicitly says the review schedule was not changed.
  6. Re-open the app state and verify no FSRS scheduling or confusion side effects were written.
- **Automated**:
  - Component tests assert each Quiz empty-state branch shows the correct CTA mix.
  - Component tests assert `Practice Anyway` is not shown when due birds exist or when fewer than 3 birds are introduced.
  - Component tests assert `QuizSession` in `practice` mode performs no scheduling updates or confusion logging.
  - Component tests assert `QuizResult` in practice mode renders the schedule-neutral disclaimer while preserving `Needs More Practice`.

### Acceptance criteria

- [ ] Given no birds are due and at least 3 birds have been introduced, when the guided path is otherwise available, then Quiz shows `Learn More Birds` as the primary action and `Practice Anyway` as the secondary action.
- [ ] Given relearning blocks learning or all lessons are complete, when no birds are due, then Quiz offers a truthful practice path without misleading `Learn More Birds` copy.
- [ ] Given birds are due or fewer than 3 birds have been introduced, when the user opens Quiz, then `Practice Anyway` is not offered.
- [ ] Given the user runs a practice session, when they complete it, then the app shows practice-specific schedule-neutral copy and writes no scheduling or confusion side effects.

### User stories addressed

- User story 5: Side-effect-free practice
- User story 6: Truthful empty states around practice

### Tasks

#### 4.1. Add practice availability branching in `QuizTab`

- [x] Task complete

**Type**: WRITE  
**Output**: `QuizTab` shows the correct CTA mix for review, learn, relearning, practice, and all-lessons-complete states.  
**Depends on**: none

Update [QuizTab.tsx](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/components/quiz/QuizTab.tsx) to compute the practice-eligibility rule in the UI layer, not core. Use existing store selectors from [appStore.ts](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/store/appStore.ts) plus lesson completion/availability context to drive truthful empty-state branches and the correct CTA hierarchy.

#### 4.2. Add `practice` mode to `QuizSession`

- [x] Task complete

**Type**: WRITE  
**Output**: `QuizSession` accepts `review` or `practice` mode and suppresses persistent side effects in practice mode.  
**Depends on**: 4.1

Refactor [QuizSession.tsx](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/components/quiz/QuizSession.tsx) to accept an explicit mode prop while reusing the existing quiz builder. Keep review behavior unchanged, but in practice mode skip scheduling writes and confusion logging while adding the small schedule-neutral header label required by the PRD.

#### 4.3. Make `QuizResult` mode-aware

- [x] Task complete

**Type**: WRITE  
**Output**: `QuizResult` renders practice-specific schedule-neutral copy while preserving the existing incorrect-answer list.  
**Depends on**: 4.2

Update [QuizResult.tsx](/Users/mistercheese/Code/avilingo-v2/beakspeak/src/components/quiz/QuizResult.tsx) so copy derives from the session mode passed in by `QuizSession`. Preserve the current result layout and `Needs More Practice` heading, but add the explicit practice disclaimer required by the implementation doc.

#### 4.4. Add component tests for practice gating and inert session behavior

- [x] Task complete

**Type**: TEST  
**Output**: Quiz component tests cover empty-state branching, practice-mode labeling, and absence of persistent writes.  
**Depends on**: 4.3

Add or extend quiz-facing component tests to cover the practice entry conditions, CTA hierarchy, practice-mode header/result copy, and the absence of scheduling or confusion writes in practice sessions. Use the current React Testing Library patterns and the existing core quiz tests as behavior references, not as UI test templates.

---
