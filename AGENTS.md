# BeakSpeak — Tech Stack

A Duolingo-style bird song identification trainer. React SPA deployed to Cloudflare Workers and packaged for iOS with Capacitor.

## Quick Reference

| Layer | Technology | Version |
|-------|-----------|---------|
| UI | React | 19.2 |
| Styling | Tailwind CSS | 4.2 |
| Animation | Framer Motion | 12.38 |
| State | Zustand | 5.0 |
| Web storage | Dexie (IndexedDB) | 4.4 |
| Native storage | @capacitor-community/sqlite | 8.1 |
| Spaced repetition | ts-fsrs | 5.3 |
| Build | Vite | 8.0 |
| Language | TypeScript | 6.0 |
| Web testing | Vitest + Testing Library + Playwright | 4.1 / 16.3 / 1.59 |
| Native shell | Capacitor iOS | 8.5 |
| Native smoke | XCTest + xcodebuildmcp | Xcode / 2.7 |
| Linting | ESLint + typescript-eslint | 9.39 / 8.58 |
| Deploy | Cloudflare Workers (static assets) | wrangler 4.83 |
| Content pipeline | Python 3 + requests + ffmpeg | 3.12+ |

## Architecture

```
beakspeak/           ← React SPA (all code here)
  capacitor.config.ts ← Native application and packaged-web configuration
  ios/
    App/             ← Capacitor-managed iOS application project
    Smoke/           ← Narrow installed-app XCTest smoke project
  src/
    core/            ← Pure TypeScript, no React/DOM deps
    adapters/        ← Browser APIs (WebAudio, IndexedDB)
    store/           ← Zustand store
    components/      ← React UI
  public/content/    ← Static audio/photo assets + manifest.json

admin/               ← Local-only audio curation tool (not deployed)
  server.py          ← Python stdlib HTTP server (run: python3 admin/server.py)
  index.html         ← Single-file admin UI (vanilla JS, no build step)

scripts/             ← Build, packaging, validation, deploy, and native-smoke tooling
content/audio-selections.toml      ← Production audio source of truth (XC IDs + optional original-source trims)
content/audio-metadata.lock.json   ← Resolved XC metadata, trim windows, and output hashes
content/manifest-base.json         ← Non-audio content used to generate the runtime manifest
content/photo-metadata.lock.json   ← Provenance and hashes of the committed bundled photos
manual_audio.py      ← Production manual-audio sync, encoder, manifest builder, and offline checker
bundle_photos.py     ← Production photo download (Wikimedia thumbnails, byte for byte) and offline checker
download_media.py    ← Legacy research pipeline: downloads audio + photos (photos to .cache/legacy-photos/), builds manifest
export_app_audio.py  ← App-audio export: regenerates manual trim outputs + manifest from existing local app audio
populate_content.py  ← Content pipeline: queries Xeno-canto + Wikipedia, ranks mixed candidates
tier1_seattle_birds_populated.json  ← Legacy candidate pool (not used by production audio builds)
wrangler.toml        ← Cloudflare Workers config for /beakspeak/*
rpi/                 ← Timestamped research and plan documents
  plans/             ← Sprint plans and implementation specs
  research/          ← Learning science and design research
```

No backend. No client-side router. All data served as static files. State managed in-memory (Zustand) with persistence to Dexie on web and native SQLite on iOS.

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
- Web DB class and shared contract at `beakspeak/src/adapters/storage.ts`
- Two tables: `progress` (keyed by speciesId) and `confusions` (auto-increment id)
- DB name: `beakspeak`

### Native SQLite

- `beakspeak/src/adapters/createStorage.ts` selects native SQLite or web Dexie.
- Native connection/operations: `sqliteStorage.ts`; SQL/migrations/conversion: `sqliteSchema.ts`.
- On storage changes, read `docs/native-storage.md` for backup policy, schema preservation, failure behavior, and the pending TestFlight gate.
- Keep platform selection at the adapter boundary and preserve the shared domain types.

### ts-fsrs 5.3

TypeScript implementation of the FSRS-6 spaced repetition algorithm. Wrapped in `beakspeak/src/core/fsrs.ts` with the FSRS-6 default weights and a tuned retention target.

- Docs: https://github.com/open-spaced-repetition/ts-fsrs
- Params: default FSRS-6 weights, `request_retention` 0.85, `maximum_interval` 180 days
- Rating mapped from response time, not self-report

### Framer Motion 12.38

Animation library. Used for swipeable bird cards in Learn mode and transition animations.

- Docs: https://motion.dev/docs
- `AnimatePresence` for enter/exit transitions
- Drag gestures for card swiping

### Vite 8.0

Build tool and dev server. Configured at `beakspeak/vite.config.ts`.

- Docs: https://vite.dev/guide
- `web` mode uses `base: '/beakspeak/'`; `native` mode uses `base: './'` for packaged assets
- Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`
- Also configures Vitest (`test` block in vite config)

### Capacitor iOS 8.5

The existing React application is packaged in an iOS shell; Android is not configured.

- App configuration: `beakspeak/capacitor.config.ts`
- Xcode application: `beakspeak/ios/App/`
- Packaged assets are generated by `npm run native:sync`; never edit `ios/App/App/public/` directly
- Native build, synchronization, simulator smoke, and physical-device instructions: `docs/native-ios.md`

### TypeScript 6.0

Strict-ish config. Target ES2023, bundler module resolution, JSX via react-jsx.

- Docs: https://www.typescriptlang.org/docs
- Config: `beakspeak/tsconfig.app.json`
- `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly` enabled
- `verbatimModuleSyntax: true` — use `import type` for type-only imports

### Vitest 4.1 + Testing Library

Unit testing with a jsdom environment covers core logic such as manifests, lessons, FSRS, and quizzes. Root Node.js tooling uses the built-in `node:test` runner.

- Vitest docs: https://vitest.dev
- Testing Library docs: https://testing-library.com/docs/react-testing-library/intro
- Run: `cd beakspeak && npx vitest run`
- Run the complete unit layer, including root tooling tests: `cd beakspeak && npm run test:unit`
- Setup file: `beakspeak/src/test/setup.ts`
- Tests live next to source: `*.test.ts` in `src/core/`

### ESLint 9.39

Flat config at `beakspeak/eslint.config.js`. Uses `typescript-eslint` and React-specific plugins.

- Docs: https://eslint.org/docs/latest
- Run: `cd beakspeak && npm run lint`
- The same command also lints root `scripts/*.mjs` with Node.js globals
- Plugins: `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`

### Cloudflare Workers (static assets only)

Deployed as a Worker with no script — pure static asset serving. Requests to static assets are free and unlimited (no Worker invocations).

- Static assets docs: https://developers.cloudflare.com/workers/static-assets
- Wrangler CLI docs: https://developers.cloudflare.com/workers/wrangler
- Config: `wrangler.toml` at repo root
- Routes: custom domains `beakspeak.app` and `www.beakspeak.app` (canonical host: `beakspeak.app`)
- `not_found_handling = "404-page"`: unknown paths get `dist/404.html`. The app has no client-side path routes, so it needs no SPA fallback.
- No `main` script, no `run_worker_first` — zero invocation costs
- Deploy: `npx --prefix beakspeak wrangler deploy`
- `wrangler deploy` adds routes but does not remove zone routes dropped from `wrangler.toml`; delete those in the Cloudflare dashboard or API and verify.

### Content Pipeline (Python)

Production audio is a manual, declarative content build and is not part of the app runtime.

- `content/audio-selections.toml` is authoritative for app roles, XC IDs, optional notes, and optional original-source `start_s`/`end_s` trims. Every species must have at least one song and one call.
- `manual_audio.py` resolves new XC metadata, validates species and licenses, caches untouched sources, chooses a sustained-energy window of at most 10 seconds when no trim is supplied, performs one trim/loudness-normalization/Opus encode, and generates the runtime manifest.
- `content/audio-metadata.lock.json` preserves metadata, resolved automatic windows, source/output hashes, and algorithm versions. Ordinary builds use `manual_audio.py --check` and never contact Xeno-canto.
- Generated audio lives under `beakspeak/public/content/audio/manual/` and source downloads under `.cache/manual-audio/`; both are gitignored and reconstructed by `uv run python3 manual_audio.py`.
- `XC_API_KEY` is required only when resolving a new XC ID or using `--refresh-metadata`.
- Bird photos are bundled, not loaded from Wikimedia. `content/manifest-base.json` lists each species' local `/content/bird-photos/{id}-{width}.jpg` srcset and the Commons file it comes from. `bundle_photos.py` downloads Wikimedia's thumbnails byte for byte into `beakspeak/public/content/bird-photos/` (committed) and records hashes in `content/photo-metadata.lock.json`. Builds run only `bundle_photos.py --check`, which never contacts Wikimedia. After editing the base manifest, re-run `uv run python3 manual_audio.py` so the audio lock's base-manifest digest and the generated manifest update.
- Legacy research photos from `download_media.py` live in `.cache/legacy-photos/` (gitignored, served by `admin/server.py` at `/photos/`). Keep them out of `beakspeak/public/`, which Vite copies into every build; never reference them from the manifest.
- The app must not request third-party hosts while learning. The Playwright fixture fails any test whose page leaves the app origin; keep it that way so the App Store "Data Not Collected" label stays true.
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

# Build and deploy to beakspeak.app (app at beakspeak.app/beakspeak/)
bash scripts/build-site.sh
npx --prefix beakspeak wrangler deploy
```

Deployment boundary:

- `beakspeak.app` is the canonical public home for BeakSpeak and its related projects (see `docs/adr/0002-move-public-web-presence-to-beakspeak-app.md`).
- This repo owns `beakspeak.app` and `www.beakspeak.app`: the landing page at `/` (`site/index.html`), the not-found page (`site/404.html`), and the app plus its public Support and Privacy pages under `/beakspeak/`.
- `/whistlewood/` on both hosts is owned and deployed by the `whistlewood` repo through more specific Worker routes. Do not build or copy Whistlewood assets here.
- `scripts/build-site.sh` assembles `dist/index.html`, `dist/404.html`, and `dist/beakspeak/`.
- Public URLs, including the app's About links and App Store metadata, use `https://beakspeak.app/beakspeak/...`. The public support contact is `support@beakspeak.app`.
- `unformedideas.com` is a separate landing page owned by the `unformedideas` repo. It 301-redirects legacy `unformedideas.com/beakspeak*` URLs to `beakspeak.app/beakspeak/`; TestFlight build 2 and older links depend on that redirect. Do not add `unformedideas.com` routes to this Worker.
- The iOS bundle identifier stays `com.unformedideas.beakspeak`. It is a permanent App Store identity, not a URL, and cannot change after upload.

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
- Keep the automated product-flow boundary in Playwright. It owns the complete learner journey and shared React behavior used by both web and Capacitor builds.
- Keep XCTest focused on native integration seams that Playwright cannot exercise: packaged launch and rendering, one accessible navigation step, lifecycle recovery, and persistence across process termination. Use the shortest learner-visible setup needed, and do not duplicate the complete learner journey or domain-level assertions in XCTest.
- Run `cd beakspeak && npm run test:ios` when a change affects Capacitor configuration, native synchronization, Xcode project files, app startup, lifecycle or audio integration, storage persistence, or the XCTest smoke. The XCTest target may live in the App project or a separate Xcode project; preserve its scope either way.
- Treat simulator automation as additional evidence, not a replacement for physical-device checks covering signing, installation, silent-switch audio, lifecycle behavior, VoiceOver, and sustained performance.
- If using XcodeBuildMCP, use the installed XcodeBuildMCP skill before calling XcodeBuildMCP tools.
