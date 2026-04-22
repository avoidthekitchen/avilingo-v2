# avilingo-v2

A Duolingo-style web app for learning Seattle-area bird songs and calls. Flash-card style introduction, spaced repetition reviews, and discrimination exercises — all in a mobile-first PWA.

**Live at:** [unformedideas.com/beakspeak](https://unformedideas.com/beakspeak/)

## What's been built

**Content pipeline** (`populate_content.py`, `download_media.py`) → **React app** (`beakspeak/`)

### Content (Sprint 0)
- 15 Seattle-area species across 5 lessons, curated by learnability
- Each species: up to 5 songs + 5 calls fetched from Xeno-canto as candidates; top 3 songs + top 2 calls selected by default and included in the app
- Clip selection scoring: quality grade (A=+50 … E=−30) dominates; bonuses for remarks (+5), confirmed sighting / adult stage / field recording (+3 each), PNW location (+0.4); penalties for playback-induced (−5), juvenile/nestling stage (−5), captive recording methods (−5); pure-typed songs ranked above compound types (e.g. "call, song") to preserve call pool
- Mnemonics, habitat tags, Wikipedia photos, and 5 confuser pairs per species
- `tier1_seattle_birds_populated.json` → `beakspeak/public/content/manifest.json`
- Manual curation via local Audio Admin tool (see below)

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

## Audio Admin

A local-only tool for manually reviewing and curating which Xeno-canto clips are included in the app.

```bash
# Run from repo root (no extra dependencies — Python stdlib only)
python3 admin/server.py
# → http://localhost:8765
```

**What it shows per clip:** spectrogram (pre-rendered), play/pause, quality grade, type (song / call / alarm call / etc.), sex, stage, recording method, location, recordist, score, license, remarks, and a link to the Xeno-canto page.

**Species header:** mnemonic and any Wikipedia audio clips for reference.

**Workflow:**
1. Run `uv run populate_content.py` to fetch 5+5 candidates per species (top 3 songs + top 2 calls are selected by default)
2. Run `uv run download_media.py` to download all candidates locally
3. Open the admin and review — the sidebar shows `selected/total` per species; toggle "In app" on any clip to include or exclude it
4. Selections save immediately to `tier1_seattle_birds_populated.json`
5. Run `uv run download_media.py` again to regenerate `manifest.json` with your selections

## Re-generating media

```bash
# Requires: Python 3, ffmpeg, uv (or pip install requests Pillow)
# Also requires XC_API_KEY env var for populate_content.py

# Full pipeline (re-query Xeno-canto + Wikipedia, re-download everything)
uv run populate_content.py   # → tier1_seattle_birds_populated.json
uv run download_media.py     # → beakspeak/public/content/ + manifest.json

# Manifest-only rebuild (after changing selections in the admin)
uv run download_media.py
```

Audio and photos are gitignored; `manifest.json` and `tier1_seattle_birds_populated.json` are checked in.

## Testing

BeakSpeak has four practical validation layers:

- **Type checking** with `tsc`
- **Linting** with `eslint`
- **Unit tests** with `vitest`
- **Mobile end-to-end tests** with Playwright

GitHub Actions runs the same checks in automation, but `test:ci` is mainly a CI mirror and is not the default local workflow.

### Install test tooling

```bash
cd beakspeak
npm install
npx playwright install chromium
```

### Type checking

```bash
cd beakspeak
npm run typecheck
```

### Linting

```bash
cd beakspeak
npm run lint
```

### Unit tests

```bash
cd beakspeak
npm run test:unit
```

`npm run test:unit` is the same Vitest suite as `npx vitest run`.

Current unit coverage includes manifest loading, lesson gating/progression, FSRS scheduling, quiz session building, audio adapter behavior, and component-level interactions.

### Mobile end-to-end test

```bash
cd beakspeak
npm run test:e2e
```

Run this after the flow is implemented and you want browser-level confirmation that the mobile path still works.

The Playwright suite runs at a mobile viewport and currently covers:

- resetting progress to a clean state
- completing Lesson 1
- finishing the intro quiz
- verifying progress persistence
- starting the review flow

Reusable E2E helpers live in `beakspeak/e2e/fixtures.ts` so future browser tests can compose app flows cleanly.

### Manual testing

If you want to sanity-check the app yourself, the usual sequence is:

```bash
cd beakspeak
npm run dev
```

Then verify the main mobile flows in the browser:

- open the Learn tab
- complete Lesson 1
- finish the intro quiz
- check that progress persists after a reload
- open the Progress tab and start a review session

### Full local CI-equivalent run

```bash
cd beakspeak
npm run test:ci
```

This runs:

- `npm run typecheck`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`

Use this only when you explicitly want the full local mirror of CI.

### Continuous integration

GitHub Actions workflow: `.github/workflows/beakspeak-ci.yml`

CI currently performs:

- dependency install
- Playwright Chromium install
- typecheck
- lint
- Vitest
- mobile Playwright E2E
- Playwright report artifact upload when present

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
