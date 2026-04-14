# Birdsong

A "Duolingo for bird sounds" web app for Seattle-area birds. Learn to identify 15 common bird species by ear through structured lessons, quizzes, and spaced repetition.

## Quick Start

```bash
# Download and normalize media (requires ffmpeg, first run only)
uv run download_media.py

# Start the dev server
cd birdsong && npm install && npm run dev
```

Open http://localhost:5173 on your phone or desktop browser.

## What's Built (v0.1)

**Learn Mode**
- 5 progressive lessons (3 birds each), ordered by distinctiveness
- Swipeable bird cards with photos, mnemonics, habitat info, and audio playback
- Intro quiz after each lesson (3-choice) with immediate feedback
- Forward testing review questions before new cards (Lesson 2+)
- Lesson gating: can't start next lesson until current one is complete

**Quiz Mode (SRS)**
- Spaced repetition via FSRS-5 algorithm (ts-fsrs) with custom auditory-learning parameters
- Two exercise types: three-choice identification and same/different discrimination
- 8-10 items per session, mix of due reviews and new introductions
- Confusion logging for future pair-mastery tracking
- Adaptive difficulty: same/different exercises unlock after 3+ reps per species

**Progress & Credits**
- Dashboard showing all 15 birds with SRS state, next review date, and rep count
- Credits page with full attribution for every recording and photo

**Tech Stack**
- React 19 + TypeScript (strict), Vite, Tailwind v4
- Zustand for state, Dexie.js (IndexedDB) for persistence
- framer-motion for card swipe animations
- ts-fsrs for spaced repetition scheduling
- All audio and images self-hosted (normalized OGG Opus audio, resized JPEG photos)

## Project Structure

```
birdsong/                  # React app
  src/
    core/                  # Pure TypeScript (no React/DOM deps)
      types.ts             # Shared interfaces
      manifest.ts          # Load/query bird manifest
      lesson.ts            # Lesson sequencing logic
      fsrs.ts              # FSRS-5 wrapper with custom params
      quiz.ts              # Quiz session builder
    adapters/              # Platform-specific implementations
      audio.ts             # Web Audio API player with caching
      storage.ts           # Dexie.js (IndexedDB) adapter
    store/
      appStore.ts          # Zustand global store
    components/
      learn/               # LearnTab, LearnSession, BirdCard, IntroQuiz
      quiz/                # QuizTab, QuizSession, ThreeChoiceQuiz, SameDifferent, QuizResult
      progress/            # Dashboard
      credits/             # CreditsPage
      shared/              # Navigation, AudioButton, AttributionInfo
  public/content/          # Self-hosted media (gitignored)
    audio/{species_id}/    # Normalized OGG clips
    photos/                # Resized JPEG photos
    manifest.json          # Manifest with local paths (checked in)

download_media.py          # Downloads + normalizes all media, generates manifest
populate_content.py        # Populates manifest with API data (already run)
tier1_seattle_birds_populated.json  # Source data: 15 species, clips, photos, lessons
```

## Content Pipeline

1. `populate_content.py` queries Wikipedia (photos) and Xeno-canto (audio) APIs to populate `tier1_seattle_birds_populated.json` (already done)
2. `download_media.py` downloads all media, normalizes audio via ffmpeg (loudnorm, Opus 96kbps, trim to 20s), resizes photos to 800px, and generates `birdsong/public/content/manifest.json` with local paths
3. The app fetches `/content/manifest.json` at startup and plays audio/images from same origin

## Configuration

The manifest (`tier1_seattle_birds_populated.json`) contains:
- 15 species with metadata, mnemonics, habitat, confuser notes
- 3 songs + 2 calls per species from Xeno-canto
- Wikipedia audio (supplementary)
- 5-lesson plan grouped by distinctiveness
- Confuser pairs for discrimination training

## To Do

- **Fix swipe gestures or replace with explicit Next/Previous buttons** — the framer-motion drag-based swipe is finicky on some devices and doesn't provide clear affordances
- **Rich media player for audio clips** — replace the simple play/stop button with a proper player that shows playback progress, supports pause, skip-ahead, replay, and scrubbing
- Additional exercise types: clip-to-photo (no names), confuser drills
- Offline/PWA support via service worker caching
- Spectrogram visualization during learning
- iOS native port (architecture supports it — core modules are pure TS)
