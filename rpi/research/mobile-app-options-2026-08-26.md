# Mobile App Options For BeakSpeak

**Date:** 2026-08-26\
**Scope:** iOS, Android, and mobile-web delivery from the existing React/Vite codebase\
**Recommendation:** Add Capacitor to the existing app; keep the web build as the PWA; introduce native storage/audio adapters only where the web implementations are not durable enough.

---

## Executive Recommendation

Use **Capacitor 8** as the first mobile architecture.

It is the only mature option considered here that can turn the current React 19/Vite/Tailwind DOM application into both iOS and Android apps while preserving nearly all of the UI and application code. Capacitor explicitly supports being added to an existing modern JavaScript project, supports iOS, Android, and web, and copies the compiled Vite bundle into the native projects during `cap sync` ([Capacitor introduction](https://capacitorjs.com/docs), [workflow](https://capacitorjs.com/docs/basics/workflow)).

The target should be one web application with three distributions:

```text
shared React/Vite app + core TypeScript
              |
       platform adapters
       /       |       \
  iOS app  Android app  Cloudflare PWA
  Capacitor  Capacitor   normal Vite build
```

Recommended details:

- Bundle the production manifest, photos, and current bird audio inside the iOS and Android applications so the learning loop works on first launch without a network connection.
- Continue deploying the same UI to Cloudflare as the PWA.
- Keep `core/`, Zustand, React components, Tailwind, Framer Motion, and most tests shared.
- Initially keep `WebAudioPlayer` and Dexie behind their existing interfaces. Validate them on physical devices, then replace only the native implementations that need stronger lifecycle or persistence guarantees.
- Move progress to a non-evictable native store before calling the native app production-ready. Capacitor warns that IndexedDB can be reclaimed on iOS; the current progress data is small enough for Capacitor Preferences, or it can move to SQLite if querying/volume grows ([Capacitor storage guidance](https://capacitorjs.com/docs/guides/storage), [Preferences](https://capacitorjs.com/docs/apis/preferences)).
- Treat native binaries as App Store/Play releases. Use remote data for content changes if desired, but do not use remote JavaScript as a way to bypass review. Apple's guideline 2.5.2 restricts downloaded code that changes app functionality ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).

This is not a permanent rejection of React Native. If the product later needs a deeply native UI, extensive background media, widgets, or sophisticated native navigation, build an Expo/React Native client then while retaining the already-separated domain packages. Starting with that rewrite now would spend effort replacing working UI and browser integrations before the product has demonstrated that it needs them.

---

## What The Repository Already Implies

The current architecture is unusually well suited to Capacitor:

- `beakspeak/src/core/` is pure TypeScript with no React or DOM dependency.
- Audio is behind an `AudioPlayer` interface.
- Persistence is behind a `StorageAdapter` interface.
- The UI is already mobile-first React DOM styled with Tailwind.
- The app has no server-side rendering, backend, or client router that must be reproduced natively.

The important web dependencies are also the reason a true React Native conversion would not be a packaging exercise:

- Components render HTML and use CSS/Tailwind, not React Native primitives.
- Animation and gesture code uses Framer Motion's DOM implementation.
- Persistence uses Dexie/IndexedDB.
- Audio uses `AudioContext`, decoded `AudioBuffer`s, `MediaStreamAudioDestinationNode`, an `HTMLAudioElement`, and animation-frame progress updates.
- Spectrograms consume Web Audio buffers.

Approximate local source distribution reinforces this: the component layer is substantially larger than the framework-independent core. A React Native conversion could reuse the learning algorithms and types, but would replace most presentation code and both browser adapters.

### The current site is not yet an offline PWA

The repo has a web app manifest, but it currently declares `"display": "browser"`, and there is no registered service worker or cache strategy. Therefore:

- It does not request standalone presentation on older iOS releases.
- The app shell, manifest JSON, photos, and audio are not intentionally available offline.
- A Trusted Web Activity would have a poor first-launch offline experience; Android's own guide notes that a service worker is not yet installed on the first launch, so an offline first launch otherwise shows a network error ([offline-first TWA guidance](https://developer.chrome.com/docs/android/trusted-web-activity/offline-first)).

iOS web apps have improved materially: Home Screen web apps support Web Push from iOS 16.4, and iOS 26 can open any Home Screen site as a web app. Service workers are still what make the experience meaningfully offline ([Web Push for iOS web apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Safari 26 web apps](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)).

### Content size is manageable, but the native input must be cleaned

The local `beakspeak/public/content` directory is roughly 98 MB today, but most of that is legacy/local audio material and dated archives. The production `audio/manual/` output is roughly 1.2 MB, and photos are roughly 1.4 MB in this checkout. A clean packaging step should include only production-referenced assets; otherwise Vite will copy all of `public/` into every native binary.

Even the full local directory is within current store ceilings: Apple allows a 4 GB uncompressed iOS app, and Google Play's current base-module compressed limit is 500 MB ([Apple maximum build sizes](https://developer.apple.com/help/app-store-connect/reference/app-uploads/maximum-build-file-sizes), [Google Play size guidance](https://support.google.com/googleplay/android-developer/answer/9859372)). Size is therefore an experience and update-bandwidth concern, not an immediate eligibility blocker.

---

## Options At A Glance

| Option | Existing UI reuse | iOS | Android | Web/PWA | Offline first launch | Native ceiling | Main compromise |
|---|---:|---:|---:|---:|---:|---:|---|
| **Capacitor** | Very high | App Store binary | Play binary | Existing Vite app | Yes when assets bundled | High through plugins/custom Swift/Kotlin | UI still runs in WKWebView/WebView |
| **Expo + React Native Web** | Low for UI; high for pure TS | Native RN app | Native RN app | Shared Expo web app | Yes with bundled assets | Very high | Rewrites HTML/CSS UI, audio, storage, and much animation |
| **Expo DOM components** | High initially | Expo WebView | Expo WebView | DOM code runs directly | Embedded export supported | Medium/high through async bridge | Two JS engines, bridge/state limits, and no DOM-component OTA updates |
| **Android TWA / PWABuilder** | Essentially all | Weak community WKWebView wrapper | Play TWA | Hosted PWA is source | No, unless separately engineered | Low | Hosted web lifecycle; weak iOS path; no direct access to web state from Android host |
| **Tauri 2 mobile** | Very high | App Store binary | Play binary | Existing web build remains separate | Yes when bundled | High through Rust/Swift/Kotlin | Smaller mobile ecosystem and more toolchain complexity than Capacitor |
| **Separate Swift/Kotlin apps** | Pure TS only if moved behind a cross-language boundary | Best possible | Best possible | Separate app | Yes | Maximum | Three UI implementations and highest maintenance cost |

---

## Option 1: Capacitor — Best Fit Now

### Why it fits

Capacitor is a native runtime around a web application, not a replacement UI framework. It can be dropped into an existing React/Vite project; its normal workflow builds the web code, copies that output into the iOS and Android projects, and produces IPA/AAB/APK binaries ([Capacitor introduction](https://capacitorjs.com/docs), [development workflow](https://capacitorjs.com/docs/basics/workflow)).

For this repo, that preserves:

- React components and hooks
- Tailwind CSS and the visual system
- Framer Motion interactions
- Zustand state
- the pure TypeScript core
- Dexie and Web Audio for the initial device prototype
- the existing unit and browser E2E tests
- the Cloudflare/Vite PWA build

Capacitor supports WKWebView on iOS 15+ and Android WebView on Android 7/API 24+ ([iOS support](https://capacitorjs.com/docs/ios), [Android support](https://capacitorjs.com/docs/android)). It also exposes native functionality through official plugins or app-local plugins written in Swift and Kotlin/Java ([custom iOS code](https://capacitorjs.com/docs/ios/custom-code), [custom Android code](https://capacitorjs.com/docs/android/custom-code)).

### Required adaptation

This is a small platform integration, not zero work:

1. Add `@capacitor/core`, CLI, iOS, and Android packages and generate native projects.
2. Make Vite's base platform-specific. Cloudflare needs `/beakspeak/`; the bundled app should normally use a relative base such as `./`. The current hard-coded Vite base would otherwise make local WebView asset URLs point at a nonexistent `/beakspeak/` path.
3. Set Capacitor `webDir` to the clean Vite output and run `cap sync` after web builds.
4. Configure app icons, splash screen, bundle identifiers, signing, status/safe areas, privacy manifests, and store metadata.
5. Test the existing audio bridge and Ogg files on physical iPhones and Android devices.
6. Add platform-aware storage and possibly audio adapters behind the interfaces that already exist.
7. Build a real service worker/cache plan for the web PWA independently of the native bundle.

### Offline content and updates

`cap sync` copies the already-built web bundle into both native projects, so all referenced production assets can ship with the app and work on the very first launch ([Capacitor workflow](https://capacitorjs.com/docs/basics/workflow)). This is more dependable for BeakSpeak than a remote wrapper because bird audio is the core interaction, not optional decoration.

There are two sensible content policies:

- **Simple first release:** bundle the entire current curriculum. New curriculum ships with a store update. This is robust and the current production content is small.
- **Later hybrid:** bundle a starter curriculum and versioned manifest, then download additional signed/hash-verified content to app storage. The app remains useful offline before the download.

UI/functionality changes should normally ride store releases. A remote manifest can safely change data/content within an already-reviewed feature model; using downloaded JavaScript to introduce new functionality is where Apple's 2.5.2 review concern begins ([Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).

### Storage

Dexie should operate in Capacitor because the app runs in a WebView with web storage APIs. It is acceptable for a prototype and not ideal as the sole durable record of learning progress. Capacitor's own storage guide says WebView IndexedDB may be reclaimed on iOS under storage pressure. It recommends Preferences for small durable key/value data and SQLite for larger/query-heavy data ([storage guide](https://capacitorjs.com/docs/guides/storage), [Preferences](https://capacitorjs.com/docs/apis/preferences)).

BeakSpeak's current progress and confusion records are small. Two reasonable implementations are:

- serialize them into Capacitor Preferences on native and keep Dexie on web; or
- use SQLite on native if analytics/confusion logs are expected to grow or become query-heavy.

The existing `StorageAdapter` means this can be done without changing lesson/quiz components.

### Audio and lifecycle

The current Web Audio implementation is a good first implementation because:

- it already addresses iOS's media channel and silent-switch behavior through a hidden `HTMLAudioElement`;
- it decodes audio for spectrogram generation;
- WebKit added Ogg Opus/Vorbis support in iOS 18.4 ([WebKit Safari 18.4 media support](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)).

However, native app status does not make a Web Audio graph a native media session. If BeakSpeak should continue playing after lock/background, present lock-screen controls, handle route changes, or recover predictably from interruptions, add a native `AudioPlayer` adapter. Apple requires an appropriate `AVAudioSession` category and background mode for background playback, while Android uses a `MediaSessionService`/foreground service ([Apple audio playback configuration](https://developer.apple.com/documentation/avfoundation/configuring-your-app-for-media-playback), [Android background playback](https://developer.android.com/media/media3/session/background-playback)).

For the current product, clips are short, foreground, and tied to an active quiz question. Background playback is likely undesirable. The initial goal should be reliable foreground playback, correct silent-switch behavior, headphone unplug handling, and interruption recovery—not a background audio entitlement.

The iOS codec floor deserves an explicit decision. Capacitor 8 supports iOS 15+, but Ogg container support arrived in iOS 18.4. Options are:

- set the app's deployment requirement to iOS 18.4+;
- ship an AAC/M4A fallback for older iOS devices; or
- use a native/third-party decoder.

Given the user's iOS-first preference, AAC fallback or an iOS 18.4 minimum is safer than assuming the current `.ogg` catalog works across Capacitor's full stated iOS range.

### Store acceptance

Apple does not categorically prohibit WKWebView apps, but guideline 4.2 says an app must provide features, content, and UI beyond a repackaged website. BeakSpeak has a better case than a content brochure: it is an interactive trainer with offline licensed media, local learning state, spaced repetition, quizzes, and original feedback. Native haptics, local review reminders, share/deep links, polished safe-area behavior, and true offline launch would strengthen the app-like experience. Approval can never be guaranteed ([Apple guideline 4.2](https://developer.apple.com/app-store/review/guidelines/), [Apple review guidance](https://developer.apple.com/app-store/review/)).

Google Play disallows unauthorized WebViews and repetitive/low-quality apps, not an owner's original web-based application. Still, the same quality principle applies: ship a functioning owned product, not merely a link to the site ([Google Play spam policy](https://support.google.com/googleplay/android-developer/answer/9899034)).

---

## Option 2: Expo / React Native — Best If Native UX Becomes The Product

Expo can provide one React Native project for iOS, Android, and web. React Native Web renders universal primitives such as `View`, `Text`, and `Image` to the web, and Expo recommends it for maximizing reuse across platforms ([Expo web guide](https://docs.expo.dev/workflow/web/)).

This is a strong architecture for a new native-first application. It is not high-reuse migration of this application. React Native does not support HTML or CSS; it uses native primitives and native API modules instead ([Expo FAQ](https://docs.expo.dev/faq/)). BeakSpeak would need to replace or substantially adapt:

- essentially every DOM component
- Tailwind's current browser-CSS integration
- Framer Motion DOM animation and gestures
- Dexie/IndexedDB
- Web Audio and `AudioBuffer`-based spectrogram integration
- browser-specific E2E fixtures and assumptions

The reusable portion would be valuable but narrower:

- `core/` lesson, quiz, FSRS, manifest, and spectrogram math where it accepts plain arrays
- domain types
- some Zustand state/actions after dependency injection is cleaned up
- manifest data and content pipeline
- much test intent, though not most component test code

### Native advantages

Expo provides stronger ready-made native facilities:

- `expo-audio` has iOS, Android, and web implementations, local bundled assets, audio-session configuration, background playback configuration, and lock-screen controls ([Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/)).
- `expo-sqlite` gives durable structured native storage; keep Dexie for web because Expo's SQLite web support has additional WASM/header requirements ([Expo data storage](https://docs.expo.dev/develop/user-interface/store-data/), [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)).
- EAS Build/Submit can create, sign, and upload iOS and Android binaries ([Expo distribution](https://docs.expo.dev/distribution/introduction/)).
- EAS Update can deliver compatible JavaScript, styling, and assets over the air, while native-code/dependency/permission changes require a new binary. Expo explicitly says updates remain subject to store rules ([EAS Update](https://docs.expo.dev/eas-update/introduction/)).

### The lower-risk Expo form

If choosing Expo, keep the current Vite app and add a sibling Expo app in a monorepo. Share pure packages rather than trying a big-bang conversion. Expo officially supports monorepos ([Expo monorepo guide](https://docs.expo.dev/guides/monorepos/)).

That permits:

```text
apps/web       existing Vite PWA
apps/mobile    Expo / React Native
packages/core  lesson, quiz, FSRS, types
packages/data  manifest/content contracts
```

This costs more than Capacitor but makes the boundary honest: one shared product model, two UI/runtime implementations.

### Expo DOM components

Expo DOM components are a useful migration bridge, not a better wrapper for this repo. They allow React DOM/CSS to run inside a native WebView and directly on web, offer embedded offline exports, and can call native actions across a bridge. Expo also documents important constraints: slower web JavaScript startup than Hermes/native views, asynchronous JSON bridge, isolated global state between JS engines, routing/composition limitations, no direct native-module access without marshalled actions, and currently no OTA updates for DOM components. Expo recommends native primitives for primary UI ([Expo DOM components](https://docs.expo.dev/guides/dom-components/)).

Wrapping the entire current app as one Expo DOM component would recreate Capacitor's core idea with more runtime/bundler migration and less direct continuity. It is useful only if there is already a firm plan to replace screens incrementally with React Native views.

---

## Option 3: Android TWA / PWABuilder — Useful Android Shortcut, Weak Portfolio Choice

A Trusted Web Activity opens an owned PWA fullscreen in the user's browser. Ownership is verified by Digital Asset Links. The browser, not the host app, renders the site; the Android host cannot directly access web state such as cookies or `localStorage`, and screens transition wholesale between web activities and native activities ([TWA overview](https://developer.chrome.com/docs/android/trusted-web-activity)).

Bubblewrap generates the Android project, and PWABuilder is a graphical generator built on the same approach ([TWA quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)).

Advantages:

- nearly no application-code change once the site is a real PWA;
- Play Store presence;
- web deployments become the app's deployments;
- browser runtime updates independently of the Android package.

Disadvantages for BeakSpeak:

- no iOS solution from TWA;
- requires the app to be genuinely offline-capable on the web first;
- first-launch offline behavior requires a native fallback because the service worker is not yet installed;
- assets normally arrive from the hosted PWA/cache rather than being inherently available at install;
- native integration and shared state are more constrained than Capacitor;
- it optimizes the user's second priority while providing no answer for the first.

PWABuilder's iOS generator is not equivalent to TWA. It creates a Swift/WKWebView project that loads the hosted PWA, and its own repository says iOS support is community-driven. Its current template also lacks some native integrations such as push notifications ([PWABuilder iOS repository](https://github.com/pwa-builder/pwabuilder-ios), [PWABuilder FAQ](https://github.com/pwa-builder/pwabuilder/blob/main/docs/builder/faq.md)). A remote hosted wrapper also presents the most direct Apple 4.2 “repackaged website” concern and sacrifices guaranteed first-launch offline audio.

PWABuilder/TWA is reasonable if the requirement changes to “put the existing PWA in Google Play as cheaply as possible.” It is not the recommended foundation for iOS-first, offline-first BeakSpeak.

---

## Option 4: Tauri 2 Mobile — Viable But Not The Default

Tauri 2 can use an existing web frontend inside the operating system WebView and build iOS and Android apps from one UI codebase. Native integrations can use Rust, Swift, and Kotlin ([Tauri overview](https://tauri.app/), [Tauri 2 stable release](https://tauri.app/blog/tauri-20/)).

It is genuinely viable and offers a strong security/capability model. It is a better candidate when desktop targets, Rust application logic, or Tauri's permission model are strategic requirements.

It is weaker for this decision because mobile is newer in Tauri's ecosystem, not every official plugin supports mobile, and its own stable-release notes describe mobile developer-experience and plugin gaps. Capacitor is built specifically around mobile web applications and has a more direct path for this React/Vite-only product ([Tauri 2 mobile support notes](https://tauri.app/blog/tauri-20/#mobile-support)).

Ionic is not a separate packaging alternative: Capacitor works without Ionic. Adopting Ionic's component library could improve native-looking web controls, but it would be an optional UI redesign, not a prerequisite for shipping.

Flutter, NativeScript, Kotlin Multiplatform UI, and separate Swift/Kotlin applications are technically viable but do not preserve the current React DOM UI. They only become sensible if the goal changes from “share this app” to “build new platform-native clients.”

---

## Recommended Architecture

Keep a single application unless a real native requirement forces a split:

```text
beakspeak/
  src/
    core/                 unchanged shared domain logic
    adapters/
      audio.ts            interface + web implementation
      audio.native.ts     optional Capacitor plugin implementation
      storage.ts          interface + Dexie web implementation
      storage.native.ts   Preferences or SQLite implementation
    components/           shared React DOM UI
  public/content/         production-only distributable content
  ios/                    generated/maintained Capacitor Xcode project
  android/                generated/maintained Capacitor Android project
  capacitor.config.ts
  vite.config.ts          web/native mode-specific base and output
```

The exact platform-module naming can follow the test/build setup; the key is to preserve the current interfaces and select implementations at composition time rather than sprinkling `Capacitor.isNativePlatform()` through components.

### Release model

| Change | PWA | iOS / Android |
|---|---|---|
| HTML/CSS/JS functionality | Cloudflare deploy | Store binary by default |
| Native plugin/permission/capability | N/A or web fallback | Store binary required |
| Small content/manifest update | Cloudflare deploy | Remote data update if supported, otherwise next binary |
| Core bundled audio set | Cache update | Store binary, or later content-pack downloader |
| Urgent bug | Cloudflare deploy | Expedited store release; consider compliant OTA only after policy/release controls exist |

---

## Staged Implementation Path

### Phase 0: Make the web distribution honest

- Change the web manifest to a standalone-capable display mode.
- Add and test a service worker with an explicit cache/version strategy.
- Define which content is required offline and which is optional.
- Remove archive/candidate material from the Vite public build input.
- Add an offline E2E case for first launch after installation/cache population.

This improves the PWA regardless of native direction.

### Phase 1: Capacitor proof on iOS first

- Add Capacitor and generate only iOS initially.
- Add a native Vite build mode with relative assets.
- Bundle clean production content.
- Run the complete learn/review flow on at least one physical iPhone.
- Specifically test Ogg decoding, silent switch, lock/unlock, interruption, Bluetooth/headphone route changes, memory pressure, and progress persistence.
- Decide between iOS 18.4 minimum and AAC fallback.

Do this before generating Android. It tests the highest-priority and most constrained runtime first.

### Phase 2: Harden iOS for store submission

- Move progress to Preferences or SQLite on native.
- Add native haptics and local review reminders where they improve the learning loop.
- Add proper app lifecycle handling and crash/error reporting.
- Polish safe areas, keyboard/text sizing, accessibility, splash/icons, and offline errors.
- Submit through TestFlight, then App Review with review notes explaining offline bird-identification training, licensed content, and the app's interactive functionality.

### Phase 3: Add Android

- Generate the Android project from the same Capacitor setup.
- Test back behavior, audio focus/interruptions, current WebView versions, persistence, and device-size range.
- Submit an Android App Bundle to Google Play.

### Phase 4: Escalate native code only when evidence requires it

- Replace Web Audio with a native player plugin if foreground reliability is insufficient or background/lock-screen playback becomes a requirement.
- Move to SQLite if progress/log complexity grows.
- Add downloadable content packs only when curriculum size makes bundled assets meaningfully costly.
- Revisit Expo/React Native only if the WebView UI itself becomes the limiting factor.

---

## Decision Rule

Choose **Capacitor now** if the intended product is the current interactive trainer, distributed natively, with occasional native affordances.

Choose **Expo/React Native instead** only if at least one of these is already a committed near-term requirement:

- native navigation and controls across most screens;
- extensive background audio and system-media integration;
- widgets, Live Activities, watch/companion surfaces, or heavy native SDK use;
- UI performance that physical-device tests show cannot be met in WKWebView/WebView;
- a product decision to redesign the web UI around React Native Web anyway.

Choose **TWA/PWABuilder** only for an Android-only low-investment store listing after the PWA is fully offline capable.

Choose **Tauri** only when desktop/Rust/capability-security goals make it strategically better than the mobile-focused Capacitor ecosystem.

For the repository and priorities as stated, Capacitor has the best balance: iOS first, Android second, web retained, high code reuse, offline assets at install, and an escape hatch to native Swift/Kotlin wherever audio or persistence needs it.
