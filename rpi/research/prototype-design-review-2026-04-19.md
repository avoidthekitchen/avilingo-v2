# BeakSpeak Prototype Design Review

**Date:** 2026-04-19
**Scope:** Full architecture and design review of the avilingo-v2 / BeakSpeak prototype

---

## What Worked Well

### Clean architecture separation
The `core/` → `adapters/` → `components/` layering is the standout decision. Pure TypeScript logic (lesson gating, FSRS scheduling, quiz building) has zero DOM or React dependencies, making it portable and testable. The 71 unit tests cover the hard parts — FSRS state transitions, rating thresholds, lesson gating — not trivial render smoke tests.

### Pedagogically grounded decisions with receipts
The 3-choice quiz format cites Rodriguez 2005; session length accounts for auditory cognitive load; the relearning gate enforces consolidation before new material. These aren't arbitrary — they're defensible and documented in the AGENTS.md rationale. Forward testing (review questions before new cards) is a genuine learning science win that most flashcard apps skip.

### Zero-backend deployment
Static JSON manifest + OGG clips on Cloudflare assets means zero server cost, no cold starts, no auth surface area. For a prototype validating whether the learning model works, this was the right call — it removed every obstacle between "idea" and "people using it."

### Audio engineering
The ffmpeg normalization pipeline (loudnorm → trim → Opus 96kbps) and the iOS silent-switch workaround (routing Web Audio through an HTMLAudioElement media channel) show real-device testing. Clip quality scoring with grade-weighted bonuses is thoughtful content curation.

### Spectrogram visualization
Pre-computing FFT on buffer load and caching it avoids jank. This is a genuinely useful learning aid for birdsong — it gives learners a visual anchor for audio patterns.

---

## What Should Change for Production

### 1. No user identity or cross-device sync
All progress lives in one browser's IndexedDB. Clear your cache, switch phones, or use a different browser and everything is gone. Production needs:
- Authentication (even anonymous-first with optional account linking)
- Server-side progress storage with conflict resolution
- This is the single highest-risk gap — users losing weeks of learning progress will churn immediately

### 2. Content pipeline is manual and fragile
`populate_content.py` → `download_media.py` → commit to repo → deploy. Adding a new region or updating clips requires a developer running Python scripts locally. Production needs:
- A content management workflow (could be as simple as a CI pipeline that runs the scripts on manifest changes)
- Content versioning so the app can update its manifest without a full redeploy
- Media served from R2/CDN with cache headers, not baked into the static build

### 3. No routing — everything is tab state in Zustand
No URL reflects app state. You can't deep-link to a lesson, share a quiz result, or hit back without leaving the app entirely. Production needs:
- Real client-side routing (React Router or TanStack Router)
- URLs like `/learn/lesson/3`, `/quiz`, `/progress`
- Browser back/forward working correctly

### 4. The Zustand store is a god object
`appStore.ts` mixes UI state (`activeTab`), domain state (`allProgress`), infrastructure (`audioPlayer`, `storage`), and computed queries into one flat store. This works at 15 species but will become painful at scale. Production should:
- Separate UI state from domain state from infrastructure
- Consider domain-specific stores or at minimum Zustand slices
- Move `audioPlayer` and `storage` out of reactive state — they're singletons, not state

### 5. No offline/PWA support despite being a perfect candidate
A birding app used outdoors with spotty signal should work offline. The prototype has no service worker, no cache manifest, no offline fallback. Production needs:
- Service worker for asset caching (Workbox or similar)
- Pre-cache current lesson's audio clips
- Offline-first IndexedDB sync when connectivity returns

### 6. Quiz distractor selection could be smarter
Distractors are drawn from introduced species + confuser pairs, but there's no weighting by confusion history. The `confusions` table in IndexedDB is write-only — logged but never read. Production should:
- Use confusion data to weight distractor selection (show confuser pairs the user actually confuses)
- Surface confusion patterns in the progress dashboard
- Feed confusion frequency back into FSRS difficulty

### 7. No error boundaries or graceful degradation
A failed manifest fetch, a corrupt IndexedDB, or a missing audio file will show a blank screen or cryptic error. Production needs:
- React error boundaries around each major section
- Retry logic for network fetches
- Graceful fallback when audio fails (show the clip metadata, offer retry)

### 8. No analytics or learning effectiveness measurement
There's no way to know if the app actually teaches people to identify birds. Production should track:
- Session completion rates
- Time-to-mastery per species
- Retention curves (are FSRS parameters well-tuned for auditory learning?)
- Drop-off points in the lesson sequence

### 9. Scaling beyond 15 species
The manifest is one monolithic JSON file with all species, all clips, all lessons. At 100+ species this becomes a large initial download. Production needs:
- Lazy-load lesson content
- Paginated or chunked manifest
- Region/tier selection that only fetches relevant content

### 10. Accessibility gaps
No ARIA labels on audio controls, no keyboard navigation for the swipe cards, spectrograms have no alt text. The drag-to-swipe gesture is touch-only. Production needs an accessibility audit — ironically, an audio-based app is well-suited for visually impaired users if the controls are properly labeled.

---

## Follow-Up Questions Addressed

### TanStack Router: Low complexity, low risk
The app has 4 tabs with no nested navigation. TanStack Router would be ~1 day of work: define 4-5 routes, replace the `activeTab` state with route matching, and wire up the tab bar to `<Link>` components. The risk is near-zero because the components already render independently — they don't depend on tab state flowing through props. The main wrinkle is the learn flow (cards → intro quiz → next species), which currently uses component-local state. That should stay as local state within the `/learn` route — it's ephemeral session progress, not something users need to deep-link into mid-flow.

### Zustand store separation: not yet, but watch for two signals
The store is fine right now at 15 species and 4 tabs. Two signals that it's time to split:

- **Reaching for `useShallow` or selectors everywhere** to avoid re-renders — means unrelated state changes are causing components to update when they shouldn't.
- **Adding a second "domain" that doesn't care about bird progress** — e.g., user profile/settings, social features, or a content editor. When two feature areas never read each other's state, they should be separate stores.

When splitting, the first move is extracting the singletons (`audioPlayer`, `storage`) out of reactive state entirely. They're infrastructure, not state — make them module-level instances that stores and components import directly.

---

## If Rewriting from Scratch

Most of the architecture would stay the same. Three things to do differently from line one:

1. **Start with routes from day one.** 20 minutes of setup that prevents the "tab state in a store" pattern from ever forming.
2. **Don't put infrastructure in the store.** `audioPlayer` and `storage` as module-level singletons from the start, not Zustand state.
3. **Design the manifest for lazy loading from the beginning.** A top-level index with per-lesson or per-species detail files (`manifest-index.json` + `species/{id}.json`). Costs nothing upfront and avoids a migration later.

Everything else — the learning science, the content pipeline, the deployment model, the `core/` purity, the adapter pattern, the test strategy — stays exactly as-is. The prototype made the right bets on the things that are expensive to change later (domain model, audio architecture, pedagogical approach) and took shortcuts on the things that are cheap to fix (routing, store shape, manifest format).
