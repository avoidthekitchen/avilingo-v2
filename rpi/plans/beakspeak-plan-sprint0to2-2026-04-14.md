# Birdsong React App — Implementation Plan (Sprints 0-2)

## Context

Building a "Duolingo for bird sounds" web app for Seattle-area birds. The content pipeline (Sprint 0) is complete — `tier1_seattle_birds_populated.json` has 15 species, each with 3 songs, 2 calls, photos, mnemonics, a 5-lesson plan, and 5 confuser pairs. This plan covers scaffolding the React app and building Learn mode (Sprint 1) and Quiz mode with SRS (Sprint 2).

### Key decisions from user
- App lives in `birdsong/` subdirectory
- npm as package manager
- framer-motion for swipeable card gestures + animations
- Zustand for state/navigation (no React Router)
- Only `four_choice` and `same_different` exercise types for now (defer `clip_to_photo`, `confuser_drill`, `this_vs_that`)
- Ignore out-of-tier confuser species
- Simple credits/about page (not modal)
- Self-host all audio and images (download + normalize ahead of time, serve from same origin)
- Lesson completion derived from species progress (all 3 species introduced = lesson complete)
- Species marked introduced only after intro quiz is completed (not on card swipe)
- Swipe left = go back to previous card (not replay audio)
- 3-choice quizzes everywhere (not 4) — Rodriguez 2005 meta-analysis: psychometrically equivalent, ~5s faster per item
- 8-10 quiz items per session (not 10-15) — auditory discrimination is more taxing per item
- Clip rotation: never same clip twice in a row per species (desirable difficulty)
- LearnSession adds 2-3 review questions before new cards (Lesson 2+) — forward testing effect
- Log confusion events {confused, with} for future pair-mastery tracking
- No "practice anyway" mode for v1 — early reviews have near-zero benefit per FSRS math
- Soft gate: don't offer next lesson if any birds are in "relearning" state
- Quiz tab when nothing due: show next review date + "Learn more birds" (or mastery warning)

---

## Phase 0.5: Media Download & Normalization Pipeline

**New script:** `download_media.py` (or extend `populate_content.py`)

**Inputs:** `tier1_seattle_birds_populated.json`

**Steps:**
1. For each species, download all audio clips (songs + calls + wikipedia_audio) from Xeno-canto and Wikimedia
2. Normalize audio with ffmpeg: `loudnorm=I=-16:TP=-1.5:LRA=11`, trim to ≤20s, convert to OGG Opus 96kbps
3. Save to `birdsong/public/content/audio/{species_id}/{xc_id}.ogg` (and `wp_{index}.ogg` for Wikipedia audio)
4. Download photos from Wikimedia, resize to 800px wide, save to `birdsong/public/content/photos/{species_id}.jpg`
5. Generate `birdsong/public/content/manifest.json` — a copy of the populated manifest with all URLs rewritten to local paths:
   - `audio_url` → `/content/audio/{species_id}/{xc_id}.ogg`
   - `photo.url` → `/content/photos/{species_id}.jpg`
   - `wikipedia_audio[].url` → `/content/audio/{species_id}/wp_{index}.ogg`
6. Add to `.gitignore`: `birdsong/public/content/audio/`, `birdsong/public/content/photos/`
7. Keep `manifest.json` checked in (small, text-only with local paths)

**Prerequisites:** Python 3, requests, Pillow (for image resize), ffmpeg installed locally

**Output:** ~25-40MB of normalized audio + optimized photos in `birdsong/public/content/`, ready to serve from same origin

---

## Phase 1: Project Scaffold

**Files created:**
- `birdsong/package.json`
- `birdsong/tsconfig.json`
- `birdsong/vite.config.ts`
- `birdsong/tailwind.config.ts` (v4 or v3 depending on stability)
- `birdsong/postcss.config.js`
- `birdsong/index.html`
- `birdsong/src/index.tsx`
- `birdsong/src/index.css` (Tailwind directives + custom color tokens)

**Steps:**
1. `npm create vite@latest birdsong -- --template react-ts`
2. `cd birdsong && npm install`
3. Install deps: `npm install zustand dexie ts-fsrs framer-motion`
4. Install dev deps: `npm install -D tailwindcss @tailwindcss/vite` (Tailwind v4 with Vite plugin)
5. Configure Tailwind v4 in `src/index.css` with `@import "tailwindcss"` and custom theme tokens (colors from spec)
7. Configure Vite with Tailwind plugin

---

## Phase 2: Core Modules (Pure TypeScript — no React/DOM imports)

### `src/core/types.ts`
All shared interfaces from the spec: `Species`, `AudioClip`, `Photo`, `WikipediaAudio`, `UserProgress`, `ConfuserPair`, `Lesson`, `ExerciseType`, plus:
- `Manifest` — top-level manifest shape (version, tier, region, species[], confuser_pairs[], lesson_plan)
- `Tab` — `'learn' | 'quiz' | 'progress' | 'credits'`

### `src/core/manifest.ts`
- `loadManifest(): Promise<Manifest>` — fetch and parse JSON from `/content/manifest.json` (local paths version)
- `getSpeciesById(manifest, id): Species | undefined`
- `getSpeciesByIds(manifest, ids): Species[]`
- `getInTierConfuserPairs(manifest): ConfuserPair[]` — filter to only pairs where both species are in the manifest
- `getLessons(manifest): Lesson[]`

### `src/core/lesson.ts`
- `getNextLesson(lessons, completedLessonNums): Lesson | null`
- `isLessonAvailable(lessonNum, completedLessonNums, allProgress): boolean` — lesson N available if N-1 complete (or N=1) AND no birds in "relearning" state
- `isLessonComplete(lesson, allProgress): boolean` — true if all 3 species have `introduced: true`
- `buildIntroQuiz(lesson, introducedSpecies, allSpecies): IntroQuizItem[]` — generate 3-5 three-choice questions for just-learned species; distractors from previously introduced birds (Lesson 2+), or within-lesson only (Lesson 1 = 3-choice with all 3 lesson birds)
- `buildReviewQuiz(introducedSpecies): ReviewQuizItem[]` — 2-3 quick three-choice questions on previously introduced birds (for forward testing effect, Lesson 2+ only)

### `src/core/fsrs.ts` (Sprint 2)
- Wrap `ts-fsrs` with custom initial parameters from spec (shortened stability for auditory learning)
- `createNewProgress(speciesId): UserProgress`
- `scheduleReview(progress, rating): UserProgress` — apply FSRS rating, return updated progress
- `isDue(progress): boolean`
- `ratingFromOutcome(correct, responseTimeMs): Rating` — map quiz performance to FSRS rating per spec table

### `src/core/quiz.ts` (Sprint 2)
- `buildQuizSession(allProgress, manifest): QuizItem[]` — build 8-10 item session (70% reviews, 30% new)
- `selectExerciseType(progress): 'three_choice' | 'same_different'` — based on reps count
- `selectDistractors(target, introduced, confuserPairs, count): Species[]` — prefer confuser species, then same-tier; count=2 (3-choice)
- `selectClip(species, lastPlayedClipId): AudioClip` — rotate clips, never same twice in a row
- `logConfusion(targetId, chosenId): ConfusionEvent` — store {confused, with, timestamp} for future pair-mastery
- `QuizItem` type: target species, exercise type, distractors, audio clip to play

---

## Phase 3: Platform Adapters

### `src/adapters/audio.ts`
- `AudioPlayer` interface: `play(url): Promise<void>`, `stop(): void`, `isPlaying(): boolean`
- `WebAudioPlayer` implementation:
  - Single shared `AudioContext` (created on first user gesture)
  - `Map<string, AudioBuffer>` cache for decoded audio
  - Loading state tracking — same-origin fetch, no CORS handling needed
  - `onStateChange` callback for UI updates
  - Handle resume of suspended AudioContext (mobile browsers)
  - Pre-fetch next clip in background while user is on current card/question

### `src/adapters/storage.ts`
- `StorageAdapter` interface: `getProgress(id)`, `saveProgress(progress)`, `getAllProgress()`, `getConfusionLog()`, `logConfusion(event)`, `clearAll()`
- `DexieStorage` implementation using Dexie.js
  - DB name: `birdsong`, version 1
  - Table: `progress` indexed on `speciesId, state, nextReview`
  - Table: `confusions` indexed on `timestamp` — stores `{targetId, chosenId, timestamp}` for future pair-mastery

---

## Phase 4: Zustand Store

### `src/store/appStore.ts`
Single store managing:
- `activeTab: Tab` — current tab (learn/quiz/progress/credits)
- `manifest: Manifest | null` — loaded manifest
- `allProgress: Map<string, UserProgress>` — SRS state per species
- `lastPlayedClipId: Map<string, string>` — in-memory only, per species, for clip rotation (resets on refresh)
- `audioPlayer: AudioPlayer` — shared instance
- `activeLessonSession: LessonSession | null` — current learn session (null when not in session)

Derived (computed from allProgress + manifest):
- `completedLessons: number[]` — lessons where all 3 species have `introduced: true`
- `introducedSpecies: Species[]` — all species with `introduced: true`

Actions:
- `initialize()` — load manifest, load progress from Dexie, set up audio player
- `setTab(tab)` — switch tabs
- `updateProgress(speciesId, progress)` — update SRS state, persist to Dexie
- `introduceSpecies(speciesIds: string[])` — mark batch as introduced (called after intro quiz complete)
- `logConfusion(targetId, chosenId)` — persist confusion event to Dexie

---

## Phase 5: Shared Components

### `src/components/shared/Navigation.tsx`
Bottom tab bar with 3 tabs: Learn, Quiz, Progress. Plus a small credits/about link.
- Reads `activeTab` from store
- Calls `setTab()` on tap
- Highlights active tab
- Fixed to bottom, mobile-safe (padding for home indicator)

### `src/components/shared/AudioButton.tsx`
- Props: `clips: AudioClip[]`, `label: string`
- Manages clip index state (cycles through clips on repeated taps)
- Shows "1/3" indicator
- Loading spinner while audio is fetching/decoding
- Animated play/stop icon
- Small (i) attribution icon that reveals recordist + license on tap

### `src/components/shared/AttributionInfo.tsx`
- Small (i) icon button
- On tap, shows a tooltip/popover with: recordist, XC ID, license, location
- Used by AudioButton and BirdCard photo

---

## Phase 6: Learn Mode (Sprint 1)

### `src/components/App.tsx`
- Calls `initialize()` on mount
- Loading spinner while manifest loads
- Renders Navigation + active tab content based on `activeTab`
- Tab content: `LearnTab`, `QuizTab`, `Dashboard`, `CreditsPage`

### `src/components/learn/LearnTab.tsx` (home screen for Learn tab)
- Shows lesson list with progress
- Each lesson card: title, species thumbnails, status (locked/available/completed)
- Overall progress indicator: "X/15 birds learned"
- Tap available lesson -> enters LearnSession

### `src/components/learn/LearnSession.tsx`
- Manages state: current phase, card index, quiz state
- Phase 0 (Lesson 2+ only): forward testing review — 2-3 quick 3-choice questions on previously introduced species. No SRS impact, auto-advance on correct. Primes encoding for new birds.
- Phase 1: swipeable card stack of 3 BirdCards (framer-motion `AnimatePresence` + drag gestures)
  - Swipe right = next bird, swipe left = go back to previous card (no-op on first card)
  - Visual cue (arrows/text) for swipe directions
- Phase 2: after all 3 cards viewed, auto-transition to intro quiz
  - 3-5 three-choice questions using lesson species + previously introduced birds as distractors
  - Lesson 1: 3 choices (all within-lesson). Lesson 2+: 3 choices with distractors from prior lessons
  - Low-stakes: show correct/incorrect + mnemonic, no SRS
- On quiz complete: mark all 3 species as introduced, return to LearnTab

### `src/components/learn/BirdCard.tsx`
- Layout per spec wireframe:
  - Top ~60%: bird photo (edge-to-edge, `object-cover`), name overlay at bottom
  - Below: scientific name, Play Song + Play Call buttons, mnemonic, habitat pills
- Uses `AudioButton` for playback
- Photo attribution (i) icon
- framer-motion `motion.div` with drag constraints for swipe

### `src/components/learn/IntroQuiz.tsx`
- Simplified three-choice quiz (reusable pattern from Sprint 2)
- Shows audio play button + 3 choices in vertical stack (photo + bird name per card)
- Correct: green highlight, show mnemonic, auto-advance 1.5s
- Incorrect: red on chosen, green on correct, show correct bird info, manual "Next"
- Results summary at end

---

## Phase 7: Quiz Mode with SRS (Sprint 2)

### `src/components/quiz/QuizTab.tsx` (home screen for Quiz tab)
- Shows count of birds due for review
- "Start Review" button (disabled if nothing due)
- If no birds introduced yet, prompt to start learning

### `src/components/quiz/QuizSession.tsx`
- Builds session via `buildQuizSession()`
- Manages: current item index, answers[], start time per question
- Routes each item to `ThreeChoiceQuiz` or `SameDifferent` based on exercise type
- After each answer: compute FSRS rating, update progress in store
- On session complete: show QuizResult

### `src/components/quiz/ThreeChoiceQuiz.tsx`
- Play button at top (auto-plays on mount)
- "Which bird is this?"
- 3 choices (1x3 or custom layout): photo + bird name per card
- Tracks response time for FSRS rating mapping: Fast < 2.5s (Easy), 2.5-7s (Good), > 7s (Hard)
- Auto-plays clip on mount; if autoplay blocked, show "Tap to play" fallback
- Answer feedback: green/red highlights, mnemonic, play correct sound button on wrong answer
- Auto-advance (correct, 1.5s) or manual "Next" (incorrect)

### `src/components/quiz/SameDifferent.tsx`
- Plays two clips sequentially with 1.5s pause between, visual indicator "Clip 1 of 2" / "Clip 2 of 2"
- "Same species or different?"
- Two large buttons: "Same" / "Different"
- After answer: reveal both species with photos, show if correct
- ~50/50 same vs different ratio, randomized per session
- "Same" pairs: mix types when possible (one song + one call from same species)
- "Different" pairs: prefer confuser pairs from manifest, fall back to random introduced species
- Response timer starts after second clip finishes (not when question appears)
- Timing thresholds: Fast < 4s (Easy), 4-10s (Good), > 10s (Hard)

### `src/components/quiz/QuizResult.tsx`
- Score: X/Y correct
- List birds marked "Again" (need more practice)
- Next review info: "N birds due for review tomorrow"
- "Back to Home" button

---

## Phase 8: Progress & Credits

### `src/components/progress/Dashboard.tsx`
- All 15 birds listed, each showing: thumbnail, name, SRS state badge (new/learning/review), next review date, total reps
- Overall progress bar: X/15 introduced, Y/15 in review state
- "Start Review" quick-launch button if birds are due

### `src/components/credits/CreditsPage.tsx`
- Simple scrollable page
- Grouped by species: species name, then all audio recordings (recordist, XC ID, license) and photo (source, license)
- Links to Xeno-canto pages and Wikipedia
- App info / version at bottom

---

## Implementation Order

I'll build in this sequence to have a working app at each milestone:

0. **Media pipeline** — download + normalize all audio/photos, generate local manifest (Phase 0.5)
1. **Scaffold** — Vite project, deps, Tailwind (Phase 1)
2. **Core types + manifest** — types.ts, manifest.ts (Phase 2 partial)
3. **Audio adapter** — WebAudioPlayer (Phase 3 partial)
4. **Store + storage** — Zustand store, Dexie adapter (Phase 4 + Phase 3 partial)
5. **App shell** — App.tsx, Navigation, tab switching (Phase 5 + 6 partial)
6. **BirdCard + AudioButton** — the core learn UI (Phase 5 + 6)
7. **LearnSession + IntroQuiz** — swipeable cards, intro quiz flow (Phase 6)
8. **LearnTab** — lesson list, lesson progression (Phase 6)
9. ***Milestone: Learn mode fully working***
10. **FSRS + quiz core** — fsrs.ts, quiz.ts (Phase 2 remaining)
11. **FourChoiceQuiz + SameDifferent** — quiz exercise components (Phase 7)
12. **QuizSession + QuizResult** — session orchestration (Phase 7)
13. **QuizTab** — quiz home screen (Phase 7)
14. ***Milestone: Quiz mode fully working***
15. **Dashboard** — progress overview (Phase 8)
16. **CreditsPage** — attribution (Phase 8)
17. ***Milestone: All Sprint 0-2 features complete***

---

## UX Decisions

### Loading & errors
- Loading screen: centered "Birdsong" text in `#8B6F47` with subtle pulse animation. No spinner — load is <200ms.
- Manifest fetch failure: "Couldn't load bird data. Tap to retry." with retry button. Single fatal error state.

### Viewport & layout
- App container: `100dvh` (dynamic viewport height)
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- Navigation bar: `pb-[env(safe-area-inset-bottom)]` for home indicator
- Main content: bottom padding = nav bar height (~64px) + safe area

### Session handling
- Learn session abandoned mid-session: restart from beginning (no session persistence). Re-seeing birds is free review.
- Quiz session: same approach — restart if abandoned

### Quiz tab empty state
- Nothing due: show next review date + "Learn more birds" button (switches to Learn tab)
- If birds are in "relearning" state: show mastery warning instead of "Learn more birds"
- No "practice anyway" mode in v1

---

## Verification

1. `cd birdsong && npm run dev` — app loads without errors, branded loading screen
2. Learn tab shows 5 lessons, Lesson 1 available, rest locked
3. Tap Lesson 1 -> swipeable cards for American Crow, Steller's Jay, Northern Flicker
4. Audio plays from local files on tap (same-origin, no CORS)
5. Swipe right to advance, swipe left to go back, audio buttons cycle clips
6. After all 3 cards -> intro quiz (3-choice) appears with 3-5 questions
7. Complete intro quiz -> Lesson 1 marked complete, Lesson 2 unlocks
8. Lesson 2 starts with 2-3 forward testing review questions before new cards
9. Quiz tab shows birds due for review
10. Start quiz session -> mix of three_choice and same_different exercises (8-10 items)
11. SameDifferent plays 2 clips with 1.5s gap, timer starts after second clip
12. Answers update SRS state (check via Progress dashboard)
13. Progress dashboard shows all 15 birds with correct states
14. Credits page lists all recordings with proper attribution
15. Mobile responsive: test at 375px width, bottom nav respects safe areas, 100dvh layout
