# BeakSpeak — Tech Stack

A Duolingo-style bird song identification trainer. Static SPA deployed to Cloudflare Workers.

## Quick Reference

| Layer | Technology | Version |
|-------|-----------|---------|
| UI | React | 19.2 |
| Styling | Tailwind CSS | 4.2 |
| Animation | Framer Motion | 12.38 |
| State | Zustand | 5.0 |
| Storage | Dexie (IndexedDB) | 4.4 |
| Spaced repetition | ts-fsrs | 5.3 |
| Build | Vite | 8.0 |
| Language | TypeScript | 6.0 |
| Testing | Vitest + Testing Library | 4.1 / 16.3 |
| Linting | ESLint + typescript-eslint | 9.39 / 8.58 |
| Deploy | Cloudflare Workers (static assets) | wrangler 4.83 |
| Content pipeline | Python 3 + requests + ffmpeg | 3.12+ |

## Architecture

```
beakspeak/           ← React SPA (all code here)
  src/
    core/            ← Pure TypeScript, no React/DOM deps
    adapters/        ← Browser APIs (WebAudio, IndexedDB)
    store/           ← Zustand store
    components/      ← React UI
  public/content/    ← Static audio/photo assets + manifest.json

admin/               ← Local-only audio curation tool (not deployed)
  server.py          ← Python stdlib HTTP server (run: python3 admin/server.py)
  index.html         ← Single-file admin UI (vanilla JS, no build step)

scripts/             ← BeakSpeak build/deploy scripts
content/audio-selections.toml      ← Production audio source of truth (XC IDs + optional original-source trims)
content/audio-metadata.lock.json   ← Resolved XC metadata, trim windows, and output hashes
content/manifest-base.json         ← Non-audio content used to generate the runtime manifest
manual_audio.py      ← Production manual-audio sync, encoder, manifest builder, and offline checker
download_media.py    ← Content pipeline: downloads audio + photos, builds manifest
export_app_audio.py  ← App-audio export: regenerates manual trim outputs + manifest from existing local app audio
populate_content.py  ← Content pipeline: queries Xeno-canto + Wikipedia, ranks mixed candidates
tier1_seattle_birds_populated.json  ← Legacy candidate pool (not used by production audio builds)
wrangler.toml        ← Cloudflare Workers config for /beakspeak/*
rpi/                 ← Timestamped research and plan documents
  plans/             ← Sprint plans and implementation specs
  research/          ← Learning science and design research
```

No backend. No client-side router. All data served as static files. State managed in-memory (Zustand) with persistence to IndexedDB (Dexie).

---

## Stack Details

### React 19.2

Standard React with JSX. No class components, no React Router, no SSR. The app is a single-page app driven by a `activeTab` state in the Zustand store.

- Docs: https://react.dev
- No `use()` or Server Components — just hooks (`useState`, `useEffect`, `useRef`)

### Tailwind CSS 4.2

Utility-first CSS via the Vite plugin (`@tailwindcss/vite`). No `tailwind.config.js` — Tailwind v4 uses CSS-based configuration.

- Docs: https://tailwindcss.com/docs
- Theme customization is in `beakspeak/src/index.css` via `@theme { }` blocks
- Custom colors: `primary`, `secondary`, `bg`, `text`, `text-muted`, `success`, `error`, `card`, `border`

### Zustand 5.0

Minimal state management. Single store at `beakspeak/src/store/appStore.ts` holds manifest data, user progress, active tab, and actions.

- Docs: https://zustand.docs.pmnd.rs
- Uses `create()` with a single flat store (no slices, no middleware)
- Components select state with `useAppStore(s => s.field)`

### Dexie 4.4

Typed IndexedDB wrapper. Used for persisting user progress and confusion event logs across sessions.

- Docs: https://dexie.org/docs
- DB class at `beakspeak/src/adapters/storage.ts`
- Two tables: `progress` (keyed by speciesId) and `confusions` (auto-increment id)
- DB name: `beakspeak`

### ts-fsrs 5.3

TypeScript implementation of the FSRS-6 spaced repetition algorithm. Wrapped in `beakspeak/src/core/fsrs.ts` with custom parameters tuned for auditory learning.

- Docs: https://github.com/open-spaced-repetition/ts-fsrs
- Custom params: faster initial stability decay than defaults
- Rating mapped from response time, not self-report

### Framer Motion 12.38

Animation library. Used for swipeable bird cards in Learn mode and transition animations.

- Docs: https://motion.dev/docs
- `AnimatePresence` for enter/exit transitions
- Drag gestures for card swiping

### Vite 8.0

Build tool and dev server. Configured at `beakspeak/vite.config.ts`.

- Docs: https://vite.dev/guide
- `base: '/beakspeak/'` — all asset URLs are prefixed for subpath deployment
- Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`
- Also configures Vitest (`test` block in vite config)

### TypeScript 6.0

Strict-ish config. Target ES2023, bundler module resolution, JSX via react-jsx.

- Docs: https://www.typescriptlang.org/docs
- Config: `beakspeak/tsconfig.app.json`
- `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly` enabled
- `verbatimModuleSyntax: true` — use `import type` for type-only imports

### Vitest 4.1 + Testing Library

Unit testing with jsdom environment. 36 tests covering core logic (manifest, lessons, FSRS, quiz).

- Vitest docs: https://vitest.dev
- Testing Library docs: https://testing-library.com/docs/react-testing-library/intro
- Run: `cd beakspeak && npx vitest run`
- Setup file: `beakspeak/src/test/setup.ts`
- Tests live next to source: `*.test.ts` in `src/core/`

### ESLint 9.39

Flat config at `beakspeak/eslint.config.js`. Uses `typescript-eslint` and React-specific plugins.

- Docs: https://eslint.org/docs/latest
- Run: `cd beakspeak && npm run lint`
- Plugins: `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`

### Cloudflare Workers (static assets only)

Deployed as a Worker with no script — pure static asset serving. Requests to static assets are free and unlimited (no Worker invocations).

- Static assets docs: https://developers.cloudflare.com/workers/static-assets
- Wrangler CLI docs: https://developers.cloudflare.com/workers/wrangler
- Config: `wrangler.toml` at repo root
- Routes: `unformedideas.com/beakspeak`, `unformedideas.com/beakspeak/*`, `www.unformedideas.com/beakspeak`, and `www.unformedideas.com/beakspeak/*`
- `not_found_handling = "single-page-application"` for SPA fallback
- No `main` script, no `run_worker_first` — zero invocation costs
- Deploy: `npx --prefix beakspeak wrangler deploy`

### Content Pipeline (Python)

Production audio is a manual, declarative content build and is not part of the app runtime.

- `content/audio-selections.toml` is authoritative for app roles, XC IDs, optional notes, and optional original-source `start_s`/`end_s` trims. Every species must have at least one song and one call.
- `manual_audio.py` resolves new XC metadata, validates species and licenses, caches untouched sources, chooses a sustained-energy window of at most 10 seconds when no trim is supplied, performs one trim/loudness-normalization/Opus encode, and generates the runtime manifest.
- `content/audio-metadata.lock.json` preserves metadata, resolved automatic windows, source/output hashes, and algorithm versions. Ordinary builds use `manual_audio.py --check` and never contact Xeno-canto.
- Generated audio lives under `beakspeak/public/content/audio/manual/` and source downloads under `.cache/manual-audio/`; both are gitignored and reconstructed by `uv run python3 manual_audio.py`.
- `XC_API_KEY` is required only when resolving a new XC ID or using `--refresh-metadata`.
- `populate_content.py`, `download_media.py`, `export_app_audio.py`, and `admin/` are the legacy candidate-research workflow. They remain callable but must not generate or overwrite production audio or `manifest.json` during normal build/deploy work.
- Managed with `uv` (see `pyproject.toml`): https://docs.astral.sh/uv
- Requires: Python 3.12+, ffmpeg/ffprobe, and `requests`

### Legacy Audio Admin (local only, not deployed)

- `admin/server.py` — Python stdlib HTTP server; run with `python3 admin/server.py` from repo root; serves on `http://localhost:8765`
- `admin/index.html` — single-file vanilla JS UI; shows mixed ranked candidates with spectrogram/metadata/evidence, a role selector (`none`/`song`/`call`), and manual trim controls for selected clips; saves immediately to `tier1_seattle_birds_populated.json`
- No extra dependencies beyond Python stdlib

## Build & Deploy

```bash
# Local dev
cd beakspeak && npm run dev

# Run tests
cd beakspeak && npx vitest run

# Build and deploy to unformedideas.com/beakspeak/
bash scripts/build-site.sh
npx --prefix beakspeak wrangler deploy
```

Deployment boundary:

- This repo owns only the BeakSpeak app at `/beakspeak/`.
- `scripts/build-site.sh` assembles `dist/beakspeak/` for the route and `dist/index.html` as the Worker SPA fallback.
- The root landing page is owned by the `unformedideas` repo.
- Other projects on unformedideas.com are owned by their own respective repos.
- Do not reintroduce `site/index.html` or deploy this Worker to `unformedideas.com/*`.

## Testing Guidance For Agents

Use the lightest test layer that gives confidence for the change, and escalate only when the change reaches a full user-facing flow.

- For most code changes in `beakspeak/src/`, run:
  - `cd beakspeak && npm run typecheck`
  - `cd beakspeak && npm run lint`
  - relevant unit tests via `cd beakspeak && npm run test:unit`
- Prefer targeted unit tests while iterating when you know the affected area. Run the full unit suite before finishing if the change touches shared logic, state management, quiz building, lesson flow, or reused components.
- Run mobile E2E with `cd beakspeak && npm run test:e2e` only after a user-facing flow is complete enough to exercise end-to-end. Do not run E2E after every small edit.
- Run E2E earlier than end-of-feature if the task is specifically about browser behavior, interaction bugs, responsive/mobile layout, persistence, navigation, or fixing a previously observed runtime issue.
- Do not run `cd beakspeak && npm run test:ci` by default. That command is a convenience mirror of CI, but the full CI stack is intended to run in GitHub Actions. Run it locally only if the user explicitly asks for it or if you are debugging CI-specific behavior.
- For docs-only, content-only, or clearly isolated non-runtime changes, it is acceptable to skip some layers if they are irrelevant. State explicitly what you did and did not run.
- When adding or modifying Playwright tests, make sure the changed spec passes locally before finishing.
- Treat browser console errors surfaced by the E2E fixture as real regressions unless there is a documented reason to ignore them.
