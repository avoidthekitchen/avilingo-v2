# Capacitor iOS feasibility build

## Automated simulator smoke check

Install Xcode with an iPhone simulator running iOS 18.4 or newer, Node 22+, uv,
ffmpeg, and `xcodebuildmcp@2.7.0`. Reconstruct audio on a fresh checkout with
`uv run python3 manual_audio.py`, then run from `beakspeak/`:

```bash
npm run test:ios
```

This synchronizes the native bundle, builds and installs the app, and runs the
small XCTest target currently stored in `ios/Smoke`. It installs without
launching: XCTest owns the only launch, because leaving a running instance
behind makes XCUITest terminate and relaunch it, and that race times the launch
out on a cold runner. Screenshots are attached even on failure. The target may
move into the App Xcode project later; its scope does not depend on its project
location. The newest available compatible iPhone simulator is selected; set
`IOS_SIMULATOR_ID` to use a particular installed device.

Three tests run:

- **Navigation** asserts Learn Birds appears, taps Lesson 1 by its accessibility
  label, and asserts American Crow appears. It does not complete a lesson.
- **Background and foreground** opens Lesson 1, starts a clip, sends the app to
  the Home Screen, reactivates it, and asserts the session came back and
  playback is not wedged. XCUITest cannot see whether the clip actually stopped —
  the control's accessible name is unchanged while playing — so silent-switch and
  stop-on-background behavior still need the physical-device checks below.
- **Force-quit persistence** uses Skip Ahead to introduce species, terminates the
  app, relaunches it, and asserts the Introduced Species count is unchanged. This
  covers Dexie durability across an ordinary force quit on the simulator only.

These tests cover native integration seams that Playwright cannot reach. Use the
shortest learner-visible setup needed for each seam. Playwright owns the complete
learner journey and shared application behavior. Do not reproduce that journey
or domain-level assertions in XCTest.

The `iOS simulator smoke` GitHub Actions job runs this same command on macOS for
pull requests and main pushes covered by the workflow. It reconstructs production
audio from the committed metadata lock (no new metadata/API key required), caches
the downloads and generated clips, and uploads JSON results, logs, and the XCTest
result bundle. Local evidence lives in the ignored `.artifacts/ios-smoke/` folder.
The runner fails on tool-reported errors even when the CLI exits with status zero,
and requires exactly three passing tests.

XcodeBuildMCP's `snapshot-ui` did not traverse WKWebView's remote accessibility
child in our iOS 26.3/26.5 checks (the smoke also passes on iOS 27.0 with
Xcode 27). XCTest did find and tap the HTML controls on both runtimes. This
smoke uses `xcodebuildmcp simulator test`; it does not depend on
coordinate tapping or the snapshot interface. It does not verify audio audibility,
silent-switch routing, exact stop-on-background behavior, VoiceOver quality,
sustained performance, signing, or physical installation.

### Known Capacitor 8.5.0 startup diagnostic

The generic `JS Eval error A JavaScript exception occurred` was traced on
2026-09-13 using temporary native diagnostic logging (removed after investigation).
The failed expression was:

```javascript
window.Capacitor.triggerEvent('resume', 'document')
```

WebKit reported `TypeError: undefined is not an object (evaluating
'window.Capacitor.triggerEvent')`, at line 1, column 17, before `WebView loaded`.
Capacitor's `setupCordovaCompatibility()` observes the scene entering foreground
and evaluates the resume event before the JavaScript bridge exists on cold start.
BeakSpeak currently has no listener for this document event; initialization and
the element-based navigation test succeed. This is a confirmed dropped early
resume event, not evidence of a failed asset request or React initialization.

No vendor patch or blanket error suppression is applied. Initialization does not
rely on this early event. The simulator smoke checks warm foreground recovery, and
the physical-device procedure below covers behavior the simulator cannot verify.
Do not treat other runtime exceptions as this known condition solely because
Capacitor prints the same generic message.

BeakSpeak has one React application with two explicit production build modes:

- `npm run build:web` uses `/beakspeak/` asset URLs for the existing Cloudflare route.
- `npm run build:native` uses relative asset URLs for Capacitor's packaged web view.

Only the iOS platform is configured. The target is portrait iPhone on iOS 18.4 or newer. Its permanent bundle identifier is `com.unformedideas.beakspeak`; use this same identifier when registering the app with Apple and creating its App Store Connect record. This identity installs separately from the earlier feasibility app and does not migrate its local progress.

## Prerequisites

- Node.js 22 or newer
- Python 3.12+, `uv`, `ffmpeg`, and `ffprobe` for the offline audio-content check
- Xcode with an iOS platform installed
- For physical installation: an Apple ID added in Xcode and an iPhone with Developer Mode enabled

Run `uv run python3 manual_audio.py` from the repository root first if the production audio files have not been generated locally.

## Build and synchronize

From `beakspeak/`:

```bash
npm install
npm run native:sync
```

This command:

1. verifies `content/audio-selections.toml`, its metadata lock, the runtime manifest, and local production audio without contacting Xeno-canto;
2. type-checks and builds the app in Vite's `native` mode;
3. removes unreferenced local photos, legacy audio, archive media, and Finder metadata from the output;
4. verifies that the packaged Ogg/Opus file set exactly matches the production manifest; and
5. runs `cap sync ios` to copy the clean bundle and update native dependencies.

The synchronized web output under `ios/App/App/public/` is generated and gitignored. Never edit it directly.

## Compile from the command line

An unsigned device compile checks the native project without requiring a signing team:

```bash
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/beakspeak-derived-data \
  CODE_SIGNING_ALLOWED=NO \
  build
```

If Xcode reports that the iOS platform is not installed, add it from Xcode > Settings > Components and retry.

## Install on a physical iPhone

1. Run `npm run native:sync`.
2. Run `npm run native:open`.
3. In Xcode, select the **App** target and open **Signing & Capabilities**.
4. Enable automatic signing and select the product owner's Personal Team. Xcode can install this feasibility build with a free Apple account.
5. Connect and unlock the iPhone, trust the Mac if prompted, enable Developer Mode on the phone, and select it as the run destination.
6. Press **Run**. If iOS asks, trust the developer profile under Settings > General > VPN & Device Management.

Cold-launch the installed Home Screen app and confirm that BeakSpeak appears without browser chrome, a blank screen, or missing local interface assets. Complete the physical-device checks from issue #26 before treating the feasibility gate as passed; command-line compilation cannot validate signing, installation, silent-switch audio, lifecycle behavior, or real-device rendering.

### Audio acceptance for issue #29

Run these checks on the supported physical iPhone after `npm run native:sync`; simulator and browser playback are not substitutes for the iOS media-session checks.

1. With the silent switch enabled, play every song and call from Progress and confirm all 30 bundled clips are audible and finish normally.
2. Start a lesson and its introductory quiz. Confirm automatic playback continues after the learner has interacted with the session. If iOS blocks an attempt, confirm the loading indicator clears and **Tap to play sound** immediately retries it.
3. Start a review and repeat play, stop, replay, and spectrogram seeking across several consecutive questions. Include a same/different question and confirm clip 2 waits for clip 1 to finish.
4. While a clip is playing, background or lock the phone. Return to BeakSpeak and confirm playback is stopped, navigation remains responsive, and tapping play starts the current or a later clip normally. Background and lock-screen playback should not continue.
5. Record the device model, iOS version, and results for silent-switch playback, all 30 clips, blocked-autoplay recovery, repeated playback, and background/foreground recovery on issue #29.

## Web regression checks

From the repository root, rebuild the deploy artifact:

```bash
bash scripts/build-site.sh
```

The Cloudflare artifact must contain `dist/beakspeak/index.html`, and its generated asset URLs must remain under `/beakspeak/`.

Then run the shared checks:

```bash
cd beakspeak
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e
```
