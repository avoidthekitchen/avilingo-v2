# Capacitor iOS Discovery Decisions

**Status:** Discovery complete; ready to turn into an implementation spec and tickets\
**Date:** 2026-08-27\
**Decision owner:** Product owner

## Outcome

Run a deliberately reversible Capacitor feasibility phase that prioritizes a reliable iPhone app while preserving the existing web deployment. If the device acceptance gate passes, move quickly to an internal TestFlight beta and then an App Store release candidate.

Capacitor is not yet a permanent architecture decision. The feasibility phase exists to test the areas where a web-based runtime could prove unsuitable: audio behavior, lifecycle handling, sustained performance, persistence, touch interaction, and accessibility on a physical iPhone.

## Milestones

### 1. iOS feasibility build

- Add Capacitor and an iOS project; do not create an Android project yet.
- Install directly from Xcode onto the product owner's physical iPhone using a free Apple developer account/Personal Team.
- Exercise the complete device acceptance gate below.
- Keep the build disposable and avoid App Store metadata work beyond what local signing requires.

### 2. Internal TestFlight beta

- Enroll in the paid Apple Developer Program as an individual.
- Choose the permanent bundle identifier and create the App Store Connect app record before the first upload.
- Use the product owner's legal personal name as the seller.
- Add the bird expert partner as an App Store Connect collaborator with access limited to BeakSpeak. Start with the least-privilege role that permits internal TestFlight testing; use a Developer role only if build or technical release responsibilities require it.
- Treat progress created with the beta's Dexie storage as disposable. No migration guarantee is required.

### 3. App Store release candidate

- Replace Dexie/IndexedDB progress persistence with native durable storage behind the existing storage adapter.
- Ship the native-storage implementation in at least one TestFlight build and validate upgrade, relaunch, and reset behavior before calling the build a release candidate.
- Complete App Store metadata, screenshots, privacy disclosures, support/privacy URLs, and submission checks.
- Keep this milestone close behind the internal beta rather than treating beta as a long-lived product phase.

## Platform and product scope

### Included

- iPhone portrait layout.
- iOS 18.4 or newer for feasibility, beta, and the first App Store release.
- All four current tabs: Learn, Quiz, Progress, and About/Credits.
- All five lessons, 15 birds, and 30 production audio clips.
- One verified end-to-end path: Learn lesson, complete its introductory quiz, perform a review, and observe the result in Progress.
- Existing learner-controlled Skip Ahead behavior.
- External credit links opening in the system browser.
- Existing Cloudflare web build and tests remaining operational.

### Explicitly deferred

- Android project and Android-specific validation.
- PWA improvements, service worker work, and feature parity guarantees for the web demo.
- Accounts, login, cloud sync, and cross-device progress.
- Subscriptions, in-app purchases, advertising, and other monetization.
- iPad layout, landscape orientation, and broad responsive redesign.
- Background or lock-screen audio playback.
- Push notifications, reminders, haptics, and other new native features.
- Third-party analytics or crash-reporting SDKs.
- Durable restoration of the exact in-progress card or quiz question after process termination.
- Remote lesson delivery, manifest synchronization, and downloadable content updates.

## Content and network behavior

- Bundle the production audio with the app. The initial version does not promise complete offline operation.
- Keep photos remote initially. A failed or unavailable photo must display a bundled neutral placeholder and must not prevent a lesson, quiz, or review from continuing.
- Ship lesson and audio changes through ordinary app updates. Do not build a remote content update system initially.
- Preserve the current Cloudflare `/beakspeak/` deployment behavior while giving the native build an asset-base configuration appropriate for its local web view.

## Audio decisions

- Use the existing Ogg/Opus production clips and set the initial minimum to iOS 18.4+. Do not add an AAC/M4A content variant unless device evidence or audience requirements justify broader OS support.
- Audio should play while the iPhone silent switch is enabled.
- Do not support background or lock-screen playback initially.
- Preserve automatic playback inside an active learning session where iOS permits it. If WebKit blocks automatic playback, present an obvious tap-to-play recovery rather than leaving the session apparently stuck.
- Verify interruption and resume behavior after backgrounding, phone/audio interruptions, and route changes sufficiently to ensure the player does not become wedged.

## Progress and session behavior

- Use the existing Dexie adapter during feasibility and the first internal beta.
- During those stages, saved progress should survive an ordinary force-quit and relaunch, but it is not promised as durable against WebKit eviction, app reinstall, storage-schema change, or the later native-storage migration.
- If iOS preserves the process while backgrounded, the current lesson should resume naturally.
- If iOS terminates the process, relaunch at the lesson list with already-saved progress intact; do not restore the exact unfinished card or quiz question initially.
- Implement native durable storage during release-candidate hardening, before App Store submission.

## Guided Path and Skip Ahead

- Remove the `?lesson=N` developer fast-forward mechanism. It is not required for the iOS app, web demo, or automated acceptance path.
- Preserve the learner-facing Skip Ahead flow when a locked future lesson is tapped.
- Preserve its current consequence: species in skipped lessons become introduced, making those lessons complete and allowing their birds to appear in future reviews. This does not fabricate successful quiz answers or mature review history.
- Keep native/web divergences at build configuration or adapter boundaries rather than scattering platform checks through learning logic.

## Distribution and privacy

- The first App Store release is free and has no account creation, login, purchases, subscriptions, advertising, or cross-device synchronization.
- Use Apple-provided TestFlight sessions, crashes, device details, and tester feedback plus Xcode/device logs during feasibility and beta. Do not add a third-party diagnostics SDK initially.
- Host the eventual support and privacy information within the existing BeakSpeak-owned web route unless a different public site is chosen during release-candidate preparation.

## Physical-device acceptance gate

The feasibility phase passes only if all of the following are true on the product owner's iPhone:

1. All four tabs are usable and the complete Learn → introductory quiz → review → Progress flow succeeds.
2. Every production audio clip plays.
3. Audio remains audible with the silent switch enabled.
4. Automatic playback works acceptably, or every blocked attempt has an immediate and understandable tap-to-play recovery.
5. Backgrounding and resuming do not permanently wedge playback or navigation.
6. A full learning/review session completes without a crash, unbounded memory growth, or progressively degrading responsiveness.
7. Card swiping, scrolling, navigation, safe-area handling, and touch targets feel acceptable on the physical device.
8. Dexie progress survives an ordinary force-quit and relaunch for feasibility/beta purposes.
9. A failed remote photo falls back without blocking the activity.
10. There is no severe VoiceOver, focus, labeling, or touch-target blocker in the tested core flow.

## Framework decision gate

If the gate fails, first make focused repairs that remain natural for Capacitor. Reconsider Expo/React Native before investing further if reliable audio, sustained spectrogram performance, lifecycle behavior, or accessibility would require substantial native replacements or pervasive platform-specific work.

Passing the gate supports continuing with Capacitor; it does not preclude a later React Native migration if the product becomes materially more native-first.

## Known risks to test early

- WebKit gesture rules may block effect- or timer-driven audio starts.
- Runtime audio decoding, FFT work, canvas spectrogram rendering, and eager clip prefetching may cause memory or thermal problems during longer sessions.
- IndexedDB can be evicted by iOS and is unsuitable for the release's long-term progress guarantee.
- Remote Wikimedia photos create a network dependency and require a deliberate failure state.
- A wrapped web interface still needs to feel complete and app-like enough for users and App Review.
- Existing bottom safe-area handling may not cover every modal, header, keyboard, or status-bar interaction.

## Decisions intentionally deferred

- Final App Store name and permanent bundle identifier, due before the first TestFlight upload.
- Exact support and privacy URLs and their final copy, due during release-candidate preparation.
- Broader iOS support and AAC/M4A generation, reconsidered only with evidence.
- Account provider, backend, identity model, and local-to-cloud migration behavior.
- Android timing and whether a future web version remains a demo or receives selected product features.

## Documentation note

No architecture decision record is created at this stage. The Capacitor choice is intentionally a reversible experiment. If the physical-device gate passes and the project commits to Capacitor for release, that commitment is the appropriate point to record an ADR with the observed evidence.
