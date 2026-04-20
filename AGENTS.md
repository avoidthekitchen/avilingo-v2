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
| Content pipeline | Python 3 + requests + Pillow | 3.12+ |

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

site/                ← Landing page for unformedideas.com
scripts/             ← Build/deploy scripts
download_media.py    ← Content pipeline: downloads audio + photos, builds manifest
populate_content.py  ← Content pipeline: queries Xeno-canto + Wikipedia, selects candidates
tier1_seattle_birds_populated.json  ← Candidate pool with per-clip selected flags (checked in)
wrangler.toml        ← Cloudflare Workers config
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
- `not_found_handling = "single-page-application"` for SPA fallback
- No `main` script, no `run_worker_first` — zero invocation costs
- Deploy: `npx --prefix beakspeak wrangler deploy`

### Content Pipeline (Python)

Two Python scripts fetch and process media from external APIs. Not part of the app runtime.

- `populate_content.py` — queries Xeno-canto API and Wikipedia; fetches up to 5 songs + 5 calls per species; marks top 3 songs + top 2 calls as `selected: true` by default; stores rich metadata (sex, stage, method, remarks); preserves manual `selected` flags from prior runs
- `download_media.py` — downloads all candidates, normalizes with ffmpeg (loudnorm, smart trim ≤20s, OGG Opus 96kbps), outputs to `beakspeak/public/content/`; only `selected: true` clips are written to `manifest.json`
- Managed with `uv` (see `pyproject.toml`): https://docs.astral.sh/uv
- Requires: Python 3.12+, ffmpeg, `requests`, `Pillow`
- `XC_API_KEY` env var required for `populate_content.py`

### Audio Admin (local only, not deployed)

- `admin/server.py` — Python stdlib HTTP server; run with `python3 admin/server.py` from repo root; serves on `http://localhost:8765`
- `admin/index.html` — single-file vanilla JS UI; shows per-clip spectrogram, metadata, and "In app" toggle; saves immediately to `tier1_seattle_birds_populated.json`
- No extra dependencies beyond Python stdlib

## Build & Deploy

```bash
# Local dev
cd beakspeak && npm run dev

# Run tests
cd beakspeak && npx vitest run

# Build and deploy to unformedideas.com
bash scripts/build-site.sh
npx --prefix beakspeak wrangler deploy
```
