# avilingo-v2

A Duolingo-style web app for learning Seattle-area bird songs and calls. Flash-card style introduction, spaced repetition reviews, and discrimination exercises — all in a mobile-first PWA.

**Live at:** [unformedideas.com/beakspeak](https://unformedideas.com/beakspeak/)

## What's been built

**Content pipeline** (`populate_content.py`, `download_media.py`) → **React app** (`beakspeak/`)

### Content (Sprint 0)
- 15 Seattle-area species across 5 lessons, curated by learnability
- Each species: 3 songs + 2 calls from Xeno-canto, normalized to OGG Opus 96kbps
- Clip selection scoring: quality grade (A=+50 … E=−30) dominates; bonuses for remarks (+5), confirmed sighting / adult stage / field recording (+3 each), PNW location (+0.4); penalties for playback-induced (−5), juvenile/nestling stage (−5), captive recording methods (−5)
- Mnemonics, habitat tags, Wikipedia photos, and 5 confuser pairs per species
- `tier1_seattle_birds_populated.json` → `beakspeak/public/content/manifest.json`

### Learn mode (Sprint 1)
- Swipeable bird cards (framer-motion) with edge-to-edge photo, song/call playback, mnemonic
- 5 lessons × 3 birds, each gated on the previous lesson completing
- Intro quiz after each lesson (3-choice, 5 questions) — species only marked "introduced" after quiz
- Forward testing: Lesson 2+ starts with a 2-question warm-up on already-learned birds

### Quiz mode (Sprint 2)
- FSRS-6 spaced repetition with custom auditory-learning parameters (faster initial stability decay)
- Two exercise types: `three_choice` (identify the bird) and `same_different` (same species?)
- 8–10 items per session; exercise type based on rep count (3-choice first, then discrimination)
- Response-time ratings: three_choice fast <2.5s / slow >7s; same_different fast <4s / slow >10s
- Clip rotation: never plays the same clip twice in a row per species
- Confusion event logging for future pair-mastery tracking

### Progress & Credits
- Dashboard: per-species state badges (New / Learning / Review / Relearning), reps, next review date
- Credits page: full attribution for every audio recording and photo, grouped by species

## Running locally

**Prerequisites:** Node.js 18+, the media files already downloaded (see below)

```bash
# 1. Install dependencies
cd beakspeak
npm install

# 2. Start dev server
npm run dev
# → http://localhost:5173
```

The app is a single-page app with no backend — all data is served as static files from `beakspeak/public/content/`.

## Re-generating media

If you need to re-download or update the audio/photos:

```bash
# Requires: Python 3, ffmpeg, uv (or pip install requests Pillow)
uv run python3 download_media.py
```

This downloads ~25–40 MB of audio and photos into `beakspeak/public/content/` and regenerates `manifest.json` with local paths. Audio and photos are gitignored; the manifest is checked in.

## Running tests

```bash
cd beakspeak
npx vitest run        # 36 unit tests across core modules
```

Tests cover: manifest loading, lesson gating/progression, FSRS rating logic, quiz session building.

## Deploying

The site is deployed to Cloudflare Workers (static assets only, no Worker invocations):

```bash
# Build and assemble the combined site
bash scripts/build-site.sh

# Deploy to Cloudflare
npx --prefix beakspeak wrangler deploy
```

This serves:
- `unformedideas.com/` — landing page
- `unformedideas.com/beakspeak/` — BeakSpeak app

## Project structure

```
beakspeak/
  public/content/
    manifest.json          # Species data with local audio/photo paths
    audio/{species_id}/    # OGG Opus clips (gitignored)
    photos/                # JPEG photos (gitignored)
  src/
    core/                  # Pure TS — no React/DOM deps (portable to iOS later)
      types.ts             # All shared interfaces
      manifest.ts          # Manifest loading + species helpers
      lesson.ts            # Lesson gating, card building, intro quiz generation
      fsrs.ts              # FSRS-6 wrapper with auditory learning params
      quiz.ts              # Quiz session builder, clip/distractor selection
    adapters/
      audio.ts             # WebAudioPlayer — AudioContext, buffer cache, state
      storage.ts           # Dexie (IndexedDB) — progress + confusion log
    store/
      appStore.ts          # Zustand — manifest, progress Map, tab state, actions
    components/
      learn/               # BirdCard, LearnSession, IntroQuiz, LearnTab
      quiz/                # ThreeChoiceQuiz, SameDifferent, QuizSession, QuizTab, QuizResult
      progress/            # Dashboard
      credits/             # CreditsPage
      shared/              # Navigation, AudioButton, AttributionInfo
```

## Key design decisions

- **Self-hosted media** — all audio and photos served from the same origin; no CORS
- **3-choice quizzes** — Rodriguez 2005 meta-analysis: equivalent discrimination to 4-choice, ~5s faster per item
- **8–10 session length** — auditory discrimination is more cognitively taxing per item than visual flashcards
- **No "practice anyway" mode** — early FSRS reviews have near-zero retention benefit; gated by due date
- **Soft lesson gate** — next lesson blocked if any bird is in relearning state (consolidation first)
- **Clip rotation in memory only** — resets on refresh; desirable difficulty without IndexedDB overhead
