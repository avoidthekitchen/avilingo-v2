# Capacitor iOS feasibility build

BeakSpeak has one React application with two explicit production build modes:

- `npm run build:web` uses `/beakspeak/` asset URLs for the existing Cloudflare route.
- `npm run build:native` uses relative asset URLs for Capacitor's packaged web view.

Only the iOS platform is configured. The feasibility target is portrait iPhone on iOS 18.4 or newer. Its bundle identifier, `com.unformedideas.beakspeak.feasibility`, is intentionally disposable; choose and update the permanent identifier before the first TestFlight upload.

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
