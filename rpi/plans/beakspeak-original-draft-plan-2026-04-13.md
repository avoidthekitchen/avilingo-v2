# Birdsong — Implementation Spec

> A "Duolingo for bird sounds" web app. This document is the complete spec for Sprints 0–2. Hand this file and the two companion files to Claude Code to implement end to end.

## Companion files

These files are part of this spec and should be placed in the project root:

- `tier1_seattle_birds.json` — Curated manifest of 15 Tier 1 Seattle bird species with metadata, mnemonics, confuser pairs, and a 5-lesson plan. Audio clip arrays are empty and must be populated by the script below before the app can function.
- `populate_content.py` — Python script that queries Wikipedia (infobox photos) and Xeno-canto (audio recordings) APIs to populate the manifest. Run once to produce `tier1_seattle_birds_populated.json`, which is the actual data file the app consumes.

---

## Product overview

Birdsong teaches users to recognize bird sounds through a tight listen → identify → feedback → review loop. V1 is scoped to ~15 common Seattle-area birds (Tier 1), with no gamification, no social features, no monetization, and no field recording integration. The app has exactly two user-facing modes: Learn and Quiz.

### Target user

Someone living in Seattle (zip 98115 / Ravenna / University District area) who wants to learn the sounds of birds they actually encounter in their neighborhood, parks, and local trails.

### Platform

Web-first (PWA). React + TypeScript. Online-only for v1. A native iOS port (SwiftUI) may follow later if audio performance in the PWA is insufficient — the architecture below is designed to make that migration straightforward.

---

## Architecture

### Key architectural principle

**All non-UI logic must live in plain TypeScript modules with zero React/DOM/browser dependencies.** This ensures portability to a future SwiftUI native app.

Specifically, these modules must be pure TS with no React, Zustand, Dexie, or Web Audio imports:

- `src/core/fsrs.ts` — FSRS spaced repetition engine (pure math)
- `src/core/quiz.ts` — Quiz session logic (exercise selection, scoring, sequencing)
- `src/core/lesson.ts` — Lesson sequencing (which birds to introduce, tier unlock logic)
- `src/core/types.ts` — All shared data types and interfaces
- `src/core/manifest.ts` — Manifest parser/accessor

UI-specific adapters wrap these core modules:

- `src/adapters/audio.ts` — Defines `AudioPlayer` interface; web implementation uses Web Audio API. A future iOS port would implement the same interface with AVFoundation.
- `src/adapters/storage.ts` — Defines `StorageAdapter` interface; web implementation uses Dexie.js (IndexedDB). A future iOS port would use SwiftData.

### Tech stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | React 18+ with TypeScript | Strict mode |
| State management | Zustand | Single store for app state |
| Persistence | Dexie.js (IndexedDB) | SRS review state per species |
| Audio | Web Audio API | Via `AudioPlayer` adapter |
| Styling | Tailwind CSS | Utility-first, mobile-responsive |
| Build | Vite | Fast dev server, clean production builds |
| Hosting | Vercel or Cloudflare Pages | Static site, no backend for v1 |
| SRS algorithm | ts-fsrs | npm package, wraps FSRS-5 |

### Project structure

```
birdsong/
├── public/
│   └── content/
│       └── tier1_seattle_birds_populated.json   # populated manifest (from populate_content.py)
├── src/
│   ├── core/                    # PURE TS — no React, no DOM, no browser APIs
│   │   ├── types.ts             # Species, AudioClip, Photo, UserProgress, etc.
│   │   ├── manifest.ts          # Load and query the bird manifest
│   │   ├── fsrs.ts              # FSRS wrapper with custom initial params
│   │   ├── quiz.ts              # Exercise selection, session builder, scoring
│   │   └── lesson.ts            # Lesson sequencing, tier unlock logic
│   ├── adapters/                # Platform-specific implementations
│   │   ├── audio.ts             # Web Audio API playback adapter
│   │   └── storage.ts           # Dexie.js storage adapter
│   ├── store/                   # Zustand store
│   │   └── appStore.ts          # Global app state
│   ├── components/              # React components
│   │   ├── App.tsx
│   │   ├── learn/
│   │   │   ├── LearnSession.tsx     # Manages a learn session (3-5 cards)
│   │   │   └── BirdCard.tsx         # Single bird intro card
│   │   ├── quiz/
│   │   │   ├── QuizSession.tsx      # Manages a quiz session (10-15 items)
│   │   │   ├── FourChoiceQuiz.tsx   # 4-option audio quiz
│   │   │   ├── SameDifferent.tsx    # Same/different pair exercise
│   │   │   └── QuizResult.tsx       # Post-session results
│   │   ├── progress/
│   │   │   └── Dashboard.tsx        # Which birds mastered, due for review, etc.
│   │   └── shared/
│   │       ├── AudioButton.tsx      # Play/replay button with loading state
│   │       └── Navigation.tsx       # Bottom tab nav (Learn / Quiz / Progress)
│   └── index.tsx
├── tier1_seattle_birds.json           # raw manifest (check into repo)
├── populate_content.py                # run locally to populate manifest
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── vite.config.ts
```

---

## Data model

### Core types (`src/core/types.ts`)

```typescript
export interface Species {
  id: string;                          // e.g. "amro"
  common_name: string;
  scientific_name: string;
  family: string;
  ebird_frequency_pct: number;
  habitat: string[];
  seasonality: string;
  mnemonic: string;
  sound_types: {
    song: string;
    call: string;
  };
  confuser_species: string[];
  confuser_notes: string;
  audio_clips: {
    songs: AudioClip[];
    calls: AudioClip[];
  };
  photo: Photo;
  wikipedia_audio?: WikipediaAudio[];  // bonus audio from Wikipedia, if any
}

export interface AudioClip {
  xc_id: string;
  xc_url: string;
  audio_url: string;
  type: string;
  quality: string;
  length: string;
  recordist: string;
  license: string;
  location: string;
  country: string;
  score: number;
}

export interface Photo {
  url: string;
  width?: number;
  height?: number;
  filename: string;
  source: string;                      // "wikipedia_infobox"
  license: string;
  wikipedia_page: string;
}

export interface WikipediaAudio {
  url: string;
  filename: string;
  source: string;
  license: string;
  commons_page: string;
}

export interface UserProgress {
  speciesId: string;
  introduced: boolean;
  introducedAt?: number;               // unix timestamp
  // FSRS fields
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
  lastReview?: number;
  nextReview?: number;
}

export interface ConfuserPair {
  pair: [string, string];              // species IDs
  label: string;
  difficulty: 'easy' | 'medium' | 'hard';
  key_difference: string;
}

export interface Lesson {
  lesson: number;
  title: string;
  species: string[];                   // species IDs
  rationale: string;
}

export type ExerciseType =
  | 'four_choice'
  | 'same_different'
  | 'clip_to_photo'
  | 'confuser_drill';
```

### Persistence schema (Dexie.js)

```typescript
// src/adapters/storage.ts
import Dexie from 'dexie';

class BirdsongDB extends Dexie {
  progress!: Dexie.Table<UserProgress, string>;

  constructor() {
    super('birdsong');
    this.version(1).stores({
      progress: 'speciesId, state, nextReview',
    });
  }
}
```

---

## Sprint 0 — Content curation

### Steps

1. Run `python3 populate_content.py` locally. This requires `pip install requests`. The script queries:
   - Wikipedia API for the infobox photo of each species (CC-BY-SA).
   - Xeno-canto API for top-quality audio recordings (CC-BY/CC-BY-NC, quality A/B, region-biased toward Washington state).
   - It outputs `tier1_seattle_birds_populated.json`.

2. Review the output. Check for any species with missing audio or photos. The script logs warnings for these.

3. Audio normalization (batch job):
   ```bash
   # For each audio file, normalize loudness and trim to 5-20 seconds
   # Download clips first, then process with ffmpeg:
   ffmpeg -i input.ogg -af "loudnorm=I=-16:TP=-1.5:LRA=11" -t 20 -y output.mp3
   ```
   This step is optional for Sprint 0 — the app can link directly to Xeno-canto URLs initially, but normalized local files will provide a better user experience.

4. Place the populated JSON in `public/content/tier1_seattle_birds_populated.json`.

### Content sourcing summary

| Content type | Source | License | Notes |
|-------------|--------|---------|-------|
| Photos | Wikipedia infobox image | CC-BY-SA | Via `pageimages` API prop. One photo per species. |
| Audio (primary) | Xeno-canto | CC-BY / CC-BY-NC | 3 song clips + 2 call clips per species (target). No -ND licenses. |
| Audio (bonus) | Wikimedia Commons (via Wikipedia page) | CC-BY-SA | Some species have audio embedded on their Wikipedia page. Included as supplementary. |
| Mnemonics | Hand-written | N/A | In the manifest. |
| eBird frequency | eBird checklist data | N/A | Used for tier ordering only. |

Attribution must be displayed per recording (recordist name + XC ID for audio, photographer credit for photos). Build a credits/attribution screen accessible from the app.

---

## Sprint 1 — Learn mode

### User flow

1. User opens app → sees a home screen with two main actions: "Learn new birds" and "Review" (quiz). A simple progress indicator shows how many birds they've been introduced to out of 15.

2. User taps "Learn new birds" → enters a learn session.

3. Learn sessions follow the lesson plan defined in the manifest (`lesson_plan.lessons`). The user progresses through lessons sequentially: Lesson 1 ("The unmistakable three"), then Lesson 2, etc. Each lesson introduces 3 birds.

4. Within a lesson, birds are presented as a swipeable card stack. Each card shows:
   - **Top ~60%**: Bird photo (from Wikipedia infobox), edge-to-edge, with the common name overlaid at the bottom of the image in a semi-transparent bar.
   - **Below the photo**: 
     - Scientific name (italic, muted)
     - Play Song button (primary action, large)
     - Play Call button (secondary, if calls exist for this species)
     - Mnemonic text (e.g., "Cheerily, cheer-up, cheerily — a caroling whistle at dawn and dusk")
     - Habitat tags as small pills (e.g., "backyard", "parkland")
   - Audio playback: tapping a play button plays the first available clip for that type. If the user taps again, it cycles to the next clip (if multiple exist). A small "1/3" indicator shows which clip is playing.

5. User swipes right (or taps "Next") to advance to the next bird. Swipe left replays the current bird.

6. After all 3 birds in the lesson are presented, the app immediately transitions to a short intro quiz: 3-5 four-choice questions testing only the birds just introduced. This is critical for initial memory encoding. The quiz at this stage is low-stakes — no SRS tracking, just immediate reinforcement. Show correct/incorrect feedback with the bird photo + mnemonic after each answer.

7. After the intro quiz, the lesson is marked complete. The user returns to the home screen, where the next lesson is now unlocked.

### Card component (`BirdCard.tsx`)

```
┌─────────────────────────────────┐
│                                 │
│         [Bird Photo]            │
│         edge-to-edge            │
│                                 │
│  ┌───────────────────────────┐  │
│  │  American Robin           │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  Turdus migratorius             │
│                                 │
│  ▶ Play Song        ▶ Play Call │
│                          (1/3) │
│                                 │
│  "Cheerily, cheer-up, cheerily  │
│   — a caroling whistle at dawn  │
│   and dusk"                     │
│                                 │
│  [backyard] [parkland]          │
│                                 │
│         Swipe → Next            │
└─────────────────────────────────┘
```

### Audio playback (`src/adapters/audio.ts`)

```typescript
export interface AudioPlayer {
  play(url: string): Promise<void>;
  stop(): void;
  isPlaying(): boolean;
}
```

Web implementation uses the Web Audio API (`AudioContext`, `fetch` → `decodeAudioData` → `AudioBufferSourceNode`). Key considerations:

- Create a single `AudioContext` on first user interaction (browsers require user gesture to start audio).
- Cache decoded `AudioBuffer` objects in a `Map<string, AudioBuffer>` to avoid re-fetching.
- Handle CORS: Xeno-canto audio URLs may need to be proxied. Test direct fetching first — XC serves audio with permissive CORS headers for their API. If CORS is an issue, download and self-host the audio files instead (see Sprint 0 normalization step).
- Provide a loading state while the audio buffer is being fetched/decoded.

---

## Sprint 2 — Quiz mode with SRS

### SRS engine (`src/core/fsrs.ts`)

Use the `ts-fsrs` npm package. FSRS (Free Spaced Repetition Scheduler) is the successor to SM-2 and provides better retention curves.

**Custom initial parameters for auditory learning**: Sound memory decays faster than visual/text memory. Use shorter initial intervals:

```typescript
import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';

const params = generatorParameters({
  request_retention: 0.85,       // target 85% recall (slightly lower than default 0.9)
  maximum_interval: 180,         // cap at 6 months for v1
  w: [                           // custom weights — shorter initial stability
    0.3,    // w0: initial stability for Again (default 0.4)
    0.6,    // w1: initial stability for Hard (default 0.6)  
    1.8,    // w2: initial stability for Good (default 2.4 — shortened)
    4.5,    // w3: initial stability for Easy (default 5.8 — shortened)
    // remaining weights can use defaults
    5.0, 1.0, 0.75, 0.0, 1.5, 0.1, 1.0, 2.0, 0.05, 0.3, 1.4, 0.2, 2.8
  ],
});

const scheduler = fsrs(params);
```

These shortened initial stability values mean the first review after a "Good" rating comes after ~1.8 days instead of ~2.4 days, appropriate for auditory memory. These can be tuned further based on actual usage data.

### Quiz session logic (`src/core/quiz.ts`)

A quiz session is 10–15 items. The mix is:

- ~70% reviews: species due for SRS review (sorted by overdue-ness)
- ~30% new introductions: species from the next uncompleted lesson (if any remain)

If fewer than 10 reviews are due, pad the session with additional new birds or re-test recently introduced birds.

### Exercise types and progression

Each species tracks its own review history. The exercise type for a given review is selected based on the species' SRS state:

| SRS state | Reps | Exercise type | Description |
|-----------|------|---------------|-------------|
| Learning | 0-2 | `four_choice` | Hear clip, pick from 4 bird names with photos. Easiest. |
| Learning | 3-5 | `same_different` | Two clips — same species or not? Tests timbral memory. |
| Review | 6-10 | `clip_to_photo` | Hear clip, match to 1 of 4 photos (no names shown). Harder. |
| Review | 10+ | `confuser_drill` | Deliberately paired similar species. Uses confuser pairs from manifest. |

### Four-choice quiz (`FourChoiceQuiz.tsx`)

```
┌─────────────────────────────────┐
│                                 │
│         ▶ Play Sound            │
│        (tap to replay)          │
│                                 │
│  Which bird is this?            │
│                                 │
│  ┌──────────┐  ┌──────────┐    │
│  │  [photo] │  │  [photo] │    │
│  │  Robin   │  │  Crow    │    │
│  └──────────┘  └──────────┘    │
│  ┌──────────┐  ┌──────────┐    │
│  │  [photo] │  │  [photo] │    │
│  │  Jay     │  │  Sparrow │    │
│  └──────────┘  └──────────┘    │
│                                 │
└─────────────────────────────────┘
```

On answer:

- **Correct**: Green highlight on the chosen card. Brief positive feedback. Show mnemonic text for reinforcement. Auto-advance after 1.5s.
- **Incorrect**: Red highlight on chosen card, green on correct answer. Show the correct bird's photo + mnemonic + a "Play correct sound" button so the user hears the right answer. Manual advance via "Next" button.

The SRS rating maps from quiz performance:

| Outcome | FSRS Rating | Notes |
|---------|-------------|-------|
| Correct, fast (< 3s) | Easy | User knows this cold |
| Correct, normal | Good | Solid recall |
| Correct, slow (> 8s) | Hard | Struggling but got it |
| Incorrect | Again | Reset to short interval |

### Distractor selection

When building a four-choice quiz, the 3 incorrect options (distractors) should be:

1. **Prefer confuser species** if the target bird has them defined in the manifest. E.g., if testing Black-capped Chickadee, always include Chestnut-backed Chickadee as a distractor.
2. **Otherwise, select from the same tier** — birds the user has already been introduced to.
3. **Never show a bird the user hasn't encountered yet** as a distractor.

### Same/different exercise (`SameDifferent.tsx`)

Play two clips sequentially. The user answers "Same species" or "Different species". When the answer is "different", the two clips come from a confuser pair when possible.

### Post-session results (`QuizResult.tsx`)

After a quiz session, show:

- Number correct / total
- Which birds were marked "Again" (need more practice)
- When the next review is due (e.g., "3 birds due for review tomorrow")

### Progress dashboard (`Dashboard.tsx`)

Simple single-screen overview:

- List of all 15 Tier 1 birds, each showing: photo thumbnail, name, SRS state (new / learning / review), next review date, total reps.
- Overall progress: X/15 birds introduced, Y/15 birds in "review" state (i.e., past initial learning).
- "Start review" button if any birds are due.

---

## Content and licensing

### Attribution requirements

Every screen that plays audio or shows a photo must have an accessible attribution link. This doesn't need to clutter the main UI — a small (i) info icon that reveals:

- **Audio**: "Recording by [recordist name], Xeno-canto [XC ID], [license]"
- **Photo**: "Photo from Wikipedia, [license]"

Also build a dedicated Credits screen (accessible from settings/about) that lists all recordings and photos used, grouped by species.

### Xeno-canto audio URL format

Audio clips from Xeno-canto use URLs like:
```
https://xeno-canto.org/sounds/uploaded/RECORDIST/XC123456-species-name.mp3
```

These may be served with appropriate CORS headers. If not, the fallback is to download and self-host the audio files. Test during Sprint 1 — if CORS fails, add an audio download step to the Sprint 0 pipeline.

---

## UI/UX guidelines

### Mobile-first responsive design

The primary use case is a phone-sized screen (learning on a commute, in a park). Design at 375px width first, then scale up for tablet/desktop.

### Navigation

Bottom tab bar with 3 tabs:
- **Learn** — Lesson list and learn sessions
- **Quiz** — Start a review session
- **Progress** — Dashboard

### Color and typography

Use a nature-inspired but clean palette. Avoid heavy greens (too on-the-nose). Suggested:

- Primary: warm earth tone (e.g., `#8B6F47`)
- Secondary: muted teal (e.g., `#5B8A72`)
- Background: warm white (`#FAF8F5`)
- Text: near-black (`#1A1A1A`)
- Success: `#4CAF50`
- Error: `#E53935`

Typography: system font stack for performance. Use `font-display: swap` for any custom fonts.

### Session length

Learn sessions: 3 birds per lesson, ~3-5 minutes.
Quiz sessions: 10-15 items, ~5-8 minutes.

The app should feel like a quick, focused practice session — not a long study grind.

---

## What is NOT in v1

These are explicitly deferred to future versions:

- Gamification (streaks, XP, badges, life list, leaderboards)
- Social features (shared lists, community, friends)
- Field recording / live bird ID
- Monetization
- Offline mode / PWA caching
- Spectrogram rendering
- Tiers 2-4 (Washington state, PNW expansion)
- User accounts / cloud sync
- Native iOS app

---

## Future considerations (informational, do not implement)

These notes are included so architectural decisions don't accidentally foreclose future options:

- **Tier unlock logic**: Tiers 2-4 unlock when ~80% of the prior tier's species reach "review" state in FSRS (i.e., past initial learning). The manifest already defines a `lesson_plan` and `confuser_pairs` structure that can be extended per tier.
- **Offline/PWA**: The content manifest and audio files can be cached via a service worker. The Dexie.js persistence layer already works offline. Adding offline support later is an additive change, not a rewrite.
- **iOS port**: The `src/core/` modules are pure TS and can be transpiled or manually ported to Swift. The `AudioPlayer` and `StorageAdapter` interfaces are the two seams where platform-specific code lives.
