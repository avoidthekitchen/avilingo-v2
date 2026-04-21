# BeakSpeak Rewrite Architecture Review And Migration Plan

**Date:** 2026-04-21
**Scope:** Product-platform review of the BeakSpeak prototype, with a proposed migration path from the current static SPA to a production-grade learning product

---

## Summary

The prototype proved the right thing: the learning loop. It did not prove the product platform.

The strongest parts of the current codebase are the ones that are expensive to rediscover:

- `core/` domain logic boundaries
- data-driven lesson and quiz behavior
- the audio playback pipeline and device-specific handling
- spectrogram-assisted learning
- a mobile-first training flow

The weakest parts are mostly product-shell concerns:

- navigation is tab state, not routing
- app state is too centralized
- progress is local-only
- content delivery is monolithic
- error recovery and instrumentation are thin
- accessibility and product hardening are incomplete

The right production direction is not "make the prototype prettier." It is to keep the learning and audio model, then rebuild the shell around routing, service boundaries, sync, scalable content delivery, analytics, and accessibility.

---

## What The Prototype Got Right

### Clean domain boundaries

The `core/` -> `adapters/` -> `components/` layering is the best architectural decision in the app. Quiz construction, FSRS scheduling, lesson gating, and spectrogram generation are mostly isolated from React and the DOM. That separation should survive any rewrite.

### Learning behavior is data-driven

Lessons, species metadata, confuser relationships, and quiz structure live in manifests and domain code rather than being hardcoded in components. That makes the product teachable and editable without rewriting the UI every time the pedagogy changes.

### Audio was treated as a first-class constraint

The prototype shows real implementation discipline around audio:

- Web Audio playback instead of naive HTML audio
- iOS media-channel handling
- clip caching
- progress-aware playback
- spectrogram rendering tied to real buffers

That is a differentiator. It should be preserved.

### The prototype optimized the right early risks

For a prototype, it was correct to optimize:

- learning flow
- content quality
- device-safe playback
- testable domain logic

Those choices created a credible trainer quickly.

---

## What Is Fragile Or Insufficient For Production

### 1. App state is a god object

`beakspeak/src/store/appStore.ts` currently mixes:

- UI state
- learning state
- persistence concerns
- audio infrastructure
- derived selectors
- actions

That is acceptable for a prototype and poor for a product platform. It creates coupling between interaction flow, durable progress, and service lifetime. It also makes performance behavior harder to reason about as the app grows.

### 2. Navigation is state, not URL

The current `activeTab` model prevents:

- deep linking
- shareable lesson or review states
- browser back/forward behavior
- durable resume semantics
- route-level loading and error boundaries

This is the highest-leverage architectural fix.

### 3. Progress exists in one browser only

Dexie is a good offline cache and a weak system of record. In production, local-only progress means:

- no identity
- no backup
- no cross-device continuity
- no recovery path after browser loss
- no conflict model

For a learning app, losing progress is a churn event.

### 4. Content packaging will not scale cleanly

A single static manifest and asset bundle are workable at prototype scale, but the model becomes painful as content expands:

- larger initial payloads
- harder partial updates
- awkward content versioning
- tight coupling between editorial work and app deploys

### 5. The shell is still prototype-grade

The current app shell is coherent but intentionally narrow:

- hard-limited mobile-width presentation
- minimal navigation semantics
- uniform component styling
- weak branding system

That is fine for learning validation and insufficient for a durable product.

### 6. Product hardening is incomplete

Production gaps include:

- route or section error boundaries
- robust retry and fallback UX
- offline affordances
- analytics and observability
- accessibility depth beyond basics
- corrupted-storage recovery flows

---

## Rewrite Principles

### Preserve

- `core/` learning logic
- FSRS-based review model
- audio playback architecture
- spectrogram visualization
- data-driven content and lesson definitions
- mobile-first training flow

### Redesign

- routing model
- store and service boundaries
- progress sync model
- content packaging and delivery
- design system
- observability
- accessibility
- failure and recovery UX

### Avoid

- a premature "platform" backend
- rewriting domain logic for the sake of stack novelty
- mixing infrastructure objects into reactive UI state
- treating routing as a later enhancement

---

## Target Production Architecture

### Routing

Make the URL the source of truth for top-level app structure.

Suggested route shape:

- `/learn`
- `/learn/:lessonId`
- `/review`
- `/review/session/:sessionId` if session restoration is needed
- `/progress`
- `/credits`
- `/settings`

Expected result:

- deep links
- browser history support
- route-scoped loading states
- route-scoped error boundaries
- easier debugging and analytics segmentation

### State separation

Split concerns into explicit layers:

- **UI state:** modal visibility, current filters, ephemeral selection
- **session state:** current lesson run, current quiz item, in-progress interactions
- **domain state:** progress, FSRS scheduling, mastery, confusion history
- **services:** audio player, storage repository, sync client, analytics client, content loader

Infrastructure objects such as `audioPlayer` and IndexedDB repositories should not live inside Zustand state. They should be module-level services or dependency-injected adapters.

### Sync and persistence

A minimum viable production model should be:

- anonymous-first onboarding
- optional account linking
- local IndexedDB cache
- append-only or versioned progress mutations
- server reconciliation on reconnect
- deterministic conflict handling

A practical first version is local-first with a server-backed event log rather than immediate full-state replacement.

### Content delivery

Move from one large manifest to an index-plus-pack model.

Suggested shape:

- `content-index.json`
- `regions/{regionId}.json`
- `lessons/{lessonId}.json`
- `species/{speciesId}.json`

Operational goals:

- smaller initial payload
- versionable content packs
- partial content updates
- background prefetch of upcoming lessons
- cleaner CDN caching

### Learning engine as a formal product service

The current pedagogical behavior should be made explicit and measurable:

- exercise selection policy
- distractor selection policy
- lesson gating policy
- review scheduling policy
- confusion weighting policy

These rules should be versioned and tied to analytics so future tuning is based on evidence rather than intuition.

### Accessibility and observability as first-class concerns

Production should assume every interaction is instrumented and every critical control is accessible.

That means:

- keyboard-complete navigation
- screen-reader labels for playback and quiz controls
- accessible summaries for spectrograms
- non-gesture alternatives for drag/swipe interactions
- event tracking for lesson completion, review latency, replay patterns, and confusion trends

---

## Potential Migration Plan

This should be treated as a staged migration, not a blind rewrite. The existing domain model is already valuable. Replace the product shell around it in controlled phases.

### Phase 0: Freeze Contracts Around The Valuable Core

Goal: preserve what already works before the shell changes.

Work:

- document current contracts for manifest shape, lesson flow, quiz item generation, FSRS inputs/outputs, and audio adapter expectations
- expand unit coverage around `src/core/` behavior that must remain stable
- identify which parts of `appStore.ts` are true domain state versus UI session state versus infrastructure access

Exit criteria:

- domain behavior is explicit
- regression risk is reduced before UI/platform refactors begin

### Phase 1: Introduce Routing Without Changing The Learning Model

Goal: replace `activeTab` navigation with real routes while preserving existing screens.

Work:

- add a client router
- map existing tabs and major views to routes
- convert tab navigation to links
- introduce route-level loading and not-found handling
- preserve current learn/review internals where possible

Exit criteria:

- app sections are URL-addressable
- browser back/forward works
- links can open specific sections directly

Reason for doing this early:

Routing creates the future application boundary. It is the cheapest high-impact fix and makes later refactors less messy.

### Phase 2: Split Store Responsibilities And Extract Services

Goal: remove infrastructure coupling and reduce store sprawl.

Work:

- extract `audioPlayer` into a service module
- extract storage access into a repository/service boundary
- separate UI state from durable progress state
- isolate session flow state for learn/review interactions
- remove derived business logic that belongs in domain modules from the top-level store

Exit criteria:

- store responsibilities are narrower
- service lifetimes are explicit
- route components can depend on smaller, clearer state surfaces

### Phase 3: Repackage Content For Incremental Loading

Goal: make content delivery scalable without changing curriculum semantics.

Work:

- design a versioned content index format
- split manifest data by lesson, species, or region
- update content loading adapters to lazy-load packs
- prefetch the next lesson pack and likely-needed audio clips
- keep current static deployment model initially if that reduces operational risk

Exit criteria:

- first load is smaller
- content can be updated in pieces
- the app no longer depends on one monolithic manifest fetch

### Phase 4: Add Failure-Handling, Offline UX, And Instrumentation

Goal: harden the app before introducing sync complexity.

Work:

- add route and section error boundaries
- implement retry UI for manifest and media failures
- add explicit offline states and recovery paths
- add analytics for lesson starts/completions, answer accuracy, response time, replay count, and drop-off points
- surface corrupted-storage reset flows instead of silent failure

Exit criteria:

- major failure modes degrade gracefully
- the team can observe actual learning and product behavior

### Phase 5: Introduce Identity And Cross-Device Sync

Goal: make progress durable across devices without sacrificing offline behavior.

Work:

- add anonymous-first identity
- create a minimal sync API for progress events or snapshots
- queue local mutations while offline
- reconcile local and remote progress deterministically
- expose account-linking and sync-status UI

Exit criteria:

- users can recover and continue progress across devices
- local-first behavior remains intact

### Phase 6: Design System And Accessibility Pass

Goal: move from "prototype shell" to "product shell."

Work:

- define design tokens for typography, spacing, color, motion, and states
- standardize core primitives for cards, buttons, nav, progress displays, and playback controls
- complete keyboard and screen-reader paths
- add accessible alternatives for gesture-only interactions
- strengthen layout behavior beyond the current narrow-shell assumptions

Exit criteria:

- interface consistency is intentional
- accessibility is built into primitives rather than patched after the fact

---

## Delivery Strategy Recommendation

The safest path is an incremental shell rewrite over the existing domain core.

That means:

- keep `src/core/` and the current learning model as the continuity anchor
- replace navigation and state boundaries first
- harden loading, recovery, and observability before sync
- add sync only after local behavior is well understood

A full greenfield rewrite is only justified if the team wants to change both platform architecture and learning model at the same time. That is not the current need. The learning model is already the asset.

---

## Suggested Technical Sequence In This Repo

If work starts from the current codebase, the practical order should be:

1. Add routing in `beakspeak/src/` and eliminate `activeTab` as the top-level navigation source.
2. Refactor `beakspeak/src/store/appStore.ts` into smaller state surfaces and extract infrastructure services.
3. Introduce versioned content-loading adapters while keeping static deployment through Cloudflare.
4. Add analytics, error boundaries, retry flows, and offline messaging.
5. Add identity and sync once local behavior and event models are stable.
6. Finish with a deliberate design-system and accessibility pass.

This sequence preserves momentum, reduces migration risk, and avoids rewriting the strongest part of the app.

---

## One-Sentence Conclusion

The prototype mostly got the learning science and audio interaction right; production should keep those bets and rebuild the app as a routed, syncable, observable, accessible product shell around them.
