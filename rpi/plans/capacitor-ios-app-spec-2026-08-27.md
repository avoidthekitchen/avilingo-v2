# Spec: Deliver BeakSpeak as a Capacitor iOS App

## Problem Statement

BeakSpeak currently works as a React mobile web application, but learners cannot install it as a first-class iPhone app or receive it through TestFlight and the Apple App Store. Rebuilding the product in a native UI framework would delay validation and duplicate working learning, review, progress, audio, and content behavior. The product owner needs a low-cost way to establish whether the existing application can provide a reliable iPhone experience, while preserving the web demo and retaining a clear exit to Expo/React Native if physical-device evidence shows that Capacitor is the wrong foundation.

The initial effort must prioritize iOS, reach an internal beta quickly, and keep the subsequent App Store release candidate close behind. It must not expand into Android, accounts, complete offline support, PWA improvements, or unrelated native features.

## Solution

Package the existing BeakSpeak application in a Capacitor iOS shell and validate it on a physical iPhone before making Capacitor a permanent architectural commitment. Preserve one shared React and domain-logic codebase, isolate native/web differences at build-configuration and adapter boundaries, and leave the existing Cloudflare web deployment operational as a demo.

The delivery path has three gates:

1. Produce a directly installed iPhone feasibility build using Xcode and a free Apple Personal Team.
2. After the physical-device acceptance gate passes, enroll in the paid Apple Developer Program, choose the permanent bundle identifier, and distribute an internal TestFlight beta to the product owner and bird expert partner.
3. Replace disposable IndexedDB persistence with native durable storage, validate that storage in TestFlight, complete App Store submission requirements, and promote a release candidate.

The first release will contain the complete current five-lesson experience with 15 birds and 30 bundled audio clips. It will support learner-controlled Skip Ahead, local progress, remote photos with a bundled fallback, and the existing Learn, Quiz, Progress, and About/Credits areas. It will be free, require no account, and target portrait iPhones running iOS 18.4 or newer.

## User Stories

1. As an iPhone learner, I want to install BeakSpeak as an app, so that I can launch it from my Home Screen like my other learning apps.
2. As an iPhone learner, I want the app to open directly into the BeakSpeak experience, so that I do not see browser chrome or navigate through a website wrapper.
3. As a learner, I want access to all five current lessons, so that the mobile app contains the complete initial Guided Path.
4. As a learner, I want access to all 15 current birds, so that the iOS app does not feel like a reduced demo.
5. As a learner, I want every current song and call clip to be available, so that I can train with the same 30 production recordings as the web experience.
6. As a learner, I want to move through Learn, Quiz, Progress, and About/Credits, so that all existing areas of the product remain usable.
7. As a learner, I want to complete a lesson and its introductory quiz, so that I can introduce new species through the Guided Path.
8. As a learner, I want introduced species to appear in review, so that the spaced-repetition loop continues to work on iOS.
9. As a learner, I want review results to update Progress, so that I can see the effect of my practice.
10. As a learner, I want bird audio to remain audible when my iPhone silent switch is enabled, so that a silent-device setting does not make lessons appear broken.
11. As a learner, I want audio to start automatically during an active learning flow when iOS permits it, so that lessons retain their current rhythm.
12. As a learner, I want an obvious tap-to-play recovery when iOS blocks automatic playback, so that I am never stranded on an apparently frozen question.
13. As a learner, I want playback controls and progress feedback to remain responsive, so that I can replay and inspect a recording confidently.
14. As a learner, I want backgrounding and returning to the app to leave navigation and audio usable, so that an interruption does not wedge my session.
15. As a learner, I want a briefly backgrounded lesson to resume when iOS preserves the app process, so that short interruptions do not unnecessarily discard my place.
16. As a learner, I want a relaunched app to return safely to the lesson list when iOS terminated the prior process, so that the app recovers without restoring a corrupt partial question.
17. As a learner, I want completed progress to survive an ordinary force-quit and relaunch, so that normal app use does not erase my learning history.
18. As a learner, I want release-candidate progress stored durably outside evictable browser storage, so that long-term progress is appropriate for an installed app.
19. As a beta tester, I understand that progress recorded in the feasibility build and first internal beta is disposable, so that the team can replace its storage without building a one-time beta migration.
20. As a learner, I want to reset all progress, so that I can deliberately start over on the installed app.
21. As a learner, I want to tap a locked future lesson and see a clear warning, so that I understand the consequences of leaving the Guided Path.
22. As a learner, I want to confirm Skip Ahead, so that I retain control over which future lesson I open.
23. As a learner who skips ahead, I want species in skipped lessons to become Introduced Species and enter reviews, so that the resulting learning state remains coherent.
24. As a learner, I do not want a hidden query parameter manufacturing progress, so that lesson progression occurs only through visible product actions.
25. As a learner, I want a neutral placeholder when a remote bird photo cannot load, so that network or image-host failure never blocks a lesson, quiz, or review.
26. As a learner, I want bundled audio even when photos require a network connection, so that the core auditory training material is installed with the app.
27. As a learner, I want external credit and source links to open in the system browser, so that I can view their destinations without confusing in-app navigation.
28. As an iPhone learner, I want content to respect the status bar, rounded corners, and home indicator, so that controls and information are not obscured by device safe areas.
29. As an iPhone learner, I want reliable portrait interaction, so that scrolling, swiping, dialogs, and navigation feel appropriate on the initially supported form factor.
30. As a VoiceOver user, I want the core learning flow to expose meaningful labels, focus behavior, and usable touch targets, so that there is no severe accessibility blocker.
31. As a learner, I want a full session to remain responsive, so that audio decoding, prefetching, animation, and spectrogram rendering do not progressively degrade the app.
32. As a web visitor, I want the existing Cloudflare-hosted BeakSpeak demo to continue working, so that the iOS effort does not remove the public web experience.
33. As a web visitor, I want web assets to continue loading from the existing deployment subpath, so that native packaging changes do not break production URLs.
34. As a product owner, I want native and web behavior to share the existing React and learning code, so that the feasibility experiment remains inexpensive and future product work is not duplicated.
35. As a product owner, I want platform differences isolated behind configuration and adapters, so that Capacitor-specific behavior does not spread throughout learning components.
36. As a product owner, I want physical-iPhone evidence before committing to Capacitor, so that audio, lifecycle, performance, and accessibility risks are tested rather than assumed.
37. As a product owner, I want a direct Xcode installation before paying for distribution, so that the first technical gate can be completed with a free developer account.
38. As a product owner, I want an internal TestFlight beta after feasibility passes, so that the app can be tested through Apple’s real distribution environment.
39. As the bird expert partner, I want internal TestFlight access, so that I can validate bird content and learning behavior on my own device.
40. As the account holder, I want the partner restricted to BeakSpeak with the least privilege needed for testing, so that unrelated account and financial access remain private.
41. As a tester, I want to submit screenshots, feedback, and crashes through TestFlight, so that the team can diagnose beta problems without adding a third-party tracking SDK.
42. As a privacy-conscious learner, I want the initial release to contain no account, advertising, third-party analytics, or cross-device tracking, so that the app’s data practices remain simple.
43. As a learner, I want the initial app to be free with no purchases or subscriptions, so that I can use the released lesson set without a transaction flow.
44. As a product owner, I want lesson and audio changes delivered through normal app updates initially, so that remote content synchronization does not delay launch.
45. As a product owner, I want the initial deployment target to be iOS 18.4 or newer, so that the current Ogg/Opus assets can be reused without creating and maintaining AAC variants.
46. As a product owner, I want the app’s permanent identity chosen before its first TestFlight upload, so that the beta and App Store candidate use the intended bundle identifier.
47. As a product owner publishing as an individual, I want my legal name used as the App Store seller, so that organization enrollment does not delay the first release.
48. As an App Store customer, I want working support and privacy links, accurate screenshots, and truthful disclosures, so that I can evaluate the app before downloading it.
49. As an App Review reviewer, I want a complete, functional learning experience with working content and URLs, so that the app can be evaluated without special workarounds.
50. As a future account holder, I want today’s progress persistence accessed through a stable storage boundary, so that later account synchronization can replace or augment local storage without rewriting the learning domain.
51. As a developer, I want an explicit decision gate for leaving Capacitor, so that focused fixes do not turn into an unbounded native rewrite inside a web shell.
52. As a developer, I want Android and PWA expansion deferred, so that the first implementation optimizes for a reliable iPhone release.

## Implementation Decisions

- Treat Capacitor as a reversible feasibility choice until the physical-device acceptance gate passes. Do not create an architecture decision record merely for beginning the experiment.
- Deliver in three stages: direct-install feasibility, internal TestFlight beta, then App Store release-candidate hardening. The beta and release-candidate stages should follow the feasibility result closely.
- Add only an iOS native project. Do not initialize or maintain an Android project in this work.
- Preserve the existing React application, Zustand state, pure TypeScript learning domain, FSRS behavior, and current product navigation as the shared implementation.
- Use separate, explicit native and Cloudflare build modes. The native build must use asset URLs that resolve inside the packaged web view; the web build must retain its existing deployment subpath and static-hosting behavior.
- Keep platform divergence at build configuration or existing adapter interfaces. Do not scatter runtime platform checks across learning, quiz, progress, or presentation components.
- Package only the production runtime content needed by the application. Legacy/archive content and source-media caches must not enter the iOS application bundle.
- Bundle all 30 production Ogg/Opus audio clips and target iOS 18.4 or newer for feasibility, beta, and the first App Store release.
- Retain the current web-audio implementation for the first device spike. Use the existing audio abstraction as the replacement seam if physical-iPhone evidence requires a focused native implementation.
- Configure the iOS audio session so lesson audio is audible with the silent switch enabled. Background and lock-screen playback are not supported.
- Attempt automatic playback within an already active lesson or quiz interaction. A rejected or blocked playback attempt must transition to an understandable, user-recoverable state with a visible play action.
- Stop, pause, or safely reinitialize audio across lifecycle interruptions so returning to the foreground cannot leave the app permanently loading or unable to play subsequent clips.
- Preserve runtime spectrogram behavior initially, but treat eager decoding, caching, FFT work, animation, and canvas rendering as measured device risks. Optimize or narrow prefetching before replacing the architecture.
- Keep current bird photos remote for the initial release. Every product photo presentation must share a bundled neutral fallback and must continue the activity after an image error.
- Do not claim complete offline operation. Network unavailability may remove remote photos and external pages, but bundled lesson audio and locally available interface assets must remain functional.
- Deliver lesson, manifest, and audio changes through an app update. Do not add a remote content update protocol, background asset download, or content-schema migration system.
- Preserve the current Guided Path rules and learner-facing Skip Ahead confirmation.
- Preserve Skip Ahead semantics: species in incomplete earlier lessons become Introduced Species; those lessons therefore become complete and their birds become eligible for review. Do not fabricate successful answers, repetitions, stability, or mature FSRS history.
- Remove the query-string fast-forward feature and its store action. It is a developer shortcut that manufactures review state and is not part of the product.
- Continue using Dexie through feasibility and the first internal TestFlight beta. Progress in those builds is explicitly disposable and requires no migration into the release-candidate store.
- During release-candidate hardening, implement native durable progress and confusion-log persistence behind the existing storage interface. Preserve the interface’s observable save, load, list, log, and reset behavior so learning code remains storage-agnostic.
- Select the native persistence implementation based on the behavioral contract and expected growth of review/confusion data; do not use an API intended only for tiny preference values if it cannot safely support the log. The backend choice does not change domain types.
- Validate the native storage implementation in at least one TestFlight build before labeling a build as the release candidate.
- Do not restore an exact unfinished card or quiz question after process termination. Persist completed progress operations promptly; on a cold relaunch, return to a safe lesson-list state.
- Support iPhone portrait only. Apply safe-area handling to persistent navigation and any full-screen or edge-attached content needed by the accepted core flow.
- Preserve external credits and source destinations, opening them in the system browser rather than navigating the packaged app away from BeakSpeak.
- Add only the native metadata and assets required for a credible installed app, including display name, icons, launch presentation, version/build numbers, supported orientation, and permission/privacy declarations that reflect actual behavior.
- Complete feasibility with direct Xcode installation using a free Personal Team. Paid membership is a gate for TestFlight, not for beginning implementation.
- Before the first TestFlight upload, enroll as an individual, choose the permanent bundle identifier, create the App Store Connect record, and accept that the product owner’s legal name will be the seller.
- Add the bird expert partner as an App Store Connect user restricted to BeakSpeak. Use the Marketing role for testing-only access; use Developer only if they need build or technical-delivery permissions.
- Upload a normal App Store Connect build suitable for progression toward release rather than making the continuing beta path depend on an internal-only artifact.
- Use TestFlight’s sessions, crashes, device information, screenshot feedback, and Xcode/device logs for initial diagnostics. Do not add a third-party analytics or crash-reporting SDK.
- Release the first version for free with no login, accounts, cloud synchronization, advertising, subscriptions, purchases, or paid-app agreement dependency.
- Prepare accurate App Store metadata, screenshots, age/privacy declarations, review notes, support contact, privacy policy, and public support/privacy URLs during release-candidate work. These pages should live within the existing BeakSpeak-owned web route unless another public location is deliberately chosen.
- The exact App Store name and permanent bundle identifier remain deferred only until the start of the TestFlight milestone; they are not implementation blockers for the direct-install feasibility build.
- If reliable audio, sustained performance, lifecycle recovery, or accessibility requires substantial native replacement or pervasive platform-specific code, stop after focused diagnostics and reconsider Expo/React Native before further Capacitor investment.

## Testing Decisions

- The primary seam is the complete learner journey at the application boundary: launch, Learn, introductory quiz, review, Progress, navigation, and recovery. Exercise this same seam in the existing mobile Playwright suite for code-controlled behavior and on a physical iPhone for native-only behavior. This is one product seam with two environments, not separate feature-level test architectures.
- Extend the existing mobile end-to-end fixture and flow rather than creating a second end-to-end harness. Tests should query visible roles, labels, and outcomes and should not assert Capacitor internals, DOM structure, Zustand calls, or plugin implementation details.
- Preserve existing pure-domain unit tests for lesson availability, Lesson Complete status, Skip Ahead consequences, quiz construction, FSRS updates, and manifest handling. Update them only where removing the query-string fast-forward feature changes an exported product surface.
- Add narrow configuration/contract tests only where the application journey cannot provide fast, deterministic coverage: native versus web asset-base selection, the shared photo fallback, and storage-adapter conformance.
- Run type checking, linting, and the full unit suite for changes to shared configuration, state, learning flow, audio, or storage.
- Run the mobile end-to-end suite after the Capacitor-compatible flow is complete and whenever changes affect navigation, responsive behavior, persistence, photo failure, or playback recovery.
- Verify that the ordinary web production build still emits assets for the existing Cloudflare route and passes its existing browser flow.
- Verify that the native production build can be synchronized into the iOS project, compiled by Xcode, installed, cold-launched, backgrounded, foregrounded, force-quit, and relaunched without a blank screen or unresolved local asset request.
- Treat browser console errors and native runtime errors during the accepted flow as regressions unless a documented platform condition explains them.
- The direct-install feasibility gate requires the following physical-iPhone observations:
  - All four product areas are usable.
  - The complete Learn → introductory quiz → review → Progress journey succeeds.
  - All 30 production clips decode and play.
  - Audio is audible with the silent switch enabled.
  - Automatic playback succeeds or every blocked attempt provides immediate tap-to-play recovery.
  - Background/foreground transitions do not wedge playback or navigation.
  - A complete session has no crash, progressive slowdown, unbounded-feeling memory growth, or unacceptable thermal behavior.
  - Scrolling, card swiping, dialogs, navigation, safe areas, and touch targets are acceptable in portrait.
  - Dexie progress survives an ordinary force-quit and relaunch for feasibility/beta purposes.
  - Forced photo-load failure displays the bundled fallback and does not block the activity.
  - The core journey has no severe VoiceOver labeling, focus, modal, or touch-target blocker.
- The release-candidate storage gate must run against the native adapter and verify save, overwrite, cold-load, confusion logging, reset, app update, force-quit/relaunch, and expected failure handling. At least one TestFlight build must pass this gate.
- TestFlight validation should include both the product owner and bird expert partner, using real distributed builds rather than relying only on Xcode installation.
- TestFlight crash/session reporting and submitted tester feedback are acceptance inputs; the absence of third-party telemetry must not be compensated for with hidden tracking.
- A good test asserts learner-visible behavior or an adapter’s public contract. Tests that merely prove a Capacitor API was called, snapshot generated native files, or duplicate framework behavior should not be added.
- Passing the automated suites is necessary but not sufficient. Silent-switch routing, actual iOS audio gesture policy, process lifecycle, safe areas, VoiceOver, device memory, and TestFlight installation require real-device evidence.

## Out of Scope

- Android project creation, Android builds, Play Store distribution, and Android-specific design or testing.
- PWA installation improvements, service workers, complete web/mobile parity, or expanding the web demo to future full lesson/account functionality.
- Complete offline operation, offline photo packaging, downloadable lessons, background downloads, or remote content synchronization.
- Accounts, authentication, backend services, cloud saves, cross-device synchronization, or migration into a future account system.
- Migration of disposable feasibility or first-beta Dexie data into native durable storage.
- iPad-specific layouts, landscape orientation, macOS, visionOS, or other Apple platform targets.
- Supporting iOS versions earlier than 18.4 or generating AAC/M4A variants for the first release.
- Background audio, lock-screen controls, media notifications, AirPlay-specific features, or continuous playback outside an active session.
- Push notifications, reminders, haptics, widgets, deep links, universal links, and other new native features.
- New lessons, birds, audio curation, photo curation, or changes to the learning algorithm.
- Redesigning Guided Path progression, Skip Ahead consequences, Lesson Complete semantics, or the distinction between introduction and mastery.
- Persisting or restoring an exact in-progress lesson card, quiz question, animation, or playback position after iOS terminates the process.
- Third-party product analytics, attribution, advertising identifiers, or crash-reporting SDKs.
- Paid distribution, in-app purchases, subscriptions, advertising, or monetization experiments.
- Final implementation of future account-aware storage and sync; this work only preserves the adapter boundary needed to support it later.
- An Expo/React Native rewrite unless the agreed Capacitor decision gate fails.

## Further Notes

- Domain language is intentional: an Introduced Species is eligible for review but is not necessarily mastered; a Lesson Complete state means all lesson species are introduced; Skip Ahead is a learner-confirmed product action and must not be called fast-forward.
- The current production audio footprint is small enough to bundle; legacy/archive media is substantially larger and must remain outside the native application.
- Current photos are remote, so the fallback is part of the initial product behavior even though complete offline use is deferred.
- IndexedDB is acceptable only as a feasibility and first-beta compromise. The internal beta must clearly be treated as disposable progress, and native durable storage is a release-candidate requirement.
- The bird expert partner can be an internal tester when added as an eligible App Store Connect user. If the partner needs only testing access, app-limited Marketing access is preferred.
- Apple Developer Program enrollment type is settled as individual, with the product owner’s legal personal name displayed as seller.
- No architecture decision record should be created until the physical-device gate provides evidence. If Capacitor passes and becomes the release architecture, record that later commitment and its observed tradeoffs in an ADR.
- Final App Store name, permanent bundle identifier, support/privacy URLs, and their final copy are milestone inputs due before TestFlight or release-candidate submission as described above.
- Passing feasibility means continuing with Capacitor is justified for this release. It does not prohibit a later Expo/React Native migration if the product becomes substantially more native-first.
