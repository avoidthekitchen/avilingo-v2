# Internal TestFlight beta — issue #31

## Distribution configuration

| Field | Value |
|---|---|
| App Store name | BeakSpeak: Learn Bird Songs (confirmed by Xcode distribution setup) |
| Installed app name | BeakSpeak |
| Bundle identifier | `com.unformedideas.beakspeak` |
| Paid Apple team | `33M9E5MEJ9` (owner-confirmed) |
| Platform / primary language | iOS / English (U.S.) |
| SKU | `beakspeak-ios` |
| Version / initial build | `2.0.0` / `1`, subject to existing uploads |
| Supported devices | Portrait iPhone, iOS 18.4 or newer |
| Tester group | Internal Beta |
| Distribution | Normal App Store Connect upload, then internal group assignment |

The owner selected a local Xcode archive/upload for the first beta on 2026-10-08.
Xcode Cloud remains configured for later use; merging its setup PR is not a
prerequisite for this local upload.

The bundle identifier is the installed application's permanent identity. Moving
the website to another domain does not require changing it. Retain it across
updates to preserve the app's identity and local storage. Website/support/privacy
links can be updated separately. Do not upload using TestFlight Internal Only:
that archive's uploaded build cannot later be distributed externally or to
customers. [Apple app identity](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/),
[internal build restrictions](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/).

Feedback contact and collaborator invitation details were provided by the owner
in the release chat. Use the supplied Gmail plus address first, with the supplied
base address as fallback if Apple rejects it. The collaborator's surname was
confirmed as Lucas. Grant Marketing access to BeakSpeak only, without finance,
reports, or Certificates, Identifiers & Profiles access.

## Beta description

BeakSpeak helps you learn to identify Seattle-area birds by their songs and calls.
This internal beta includes five guided lessons, introductory quizzes, spaced
repetition reviews, progress tracking, bird sounds, and source credits. Please
report playback problems, unclear questions, incorrect bird content, and issues
with navigation or saved progress through TestFlight feedback.

## What to Test

This build starts fresh with native progress storage. Progress from earlier
browser-storage beta builds is disposable and will not be transferred. Progress
created in this build should survive force-quit and subsequent app updates.

1. Complete a lesson, its introductory quiz, a review, and check Progress.
2. Play songs and calls, replay a clip, and seek in the spectrogram. Try playback
   with the iPhone's silent switch enabled.
3. Background or lock the phone while audio plays. Return and confirm playback
   has stopped, navigation works, and the next clip can play.
4. Force-quit and reopen BeakSpeak. Confirm introduced birds and review progress
   remain saved and the app returns to a safe lesson-list state.
5. Check bird names, sound descriptions, recordings, and question difficulty.
6. Submit a TestFlight screenshot with a short description if something fails.

Keep the app installed for the next beta update so storage preservation can be
tested. Photos require a network connection; bundled bird audio is available
offline.

## Privacy text for owner review

BeakSpeak stores learning progress and quiz confusion history locally on your
device. The iOS progress database is eligible for device backups according to
your device's backup settings. BeakSpeak provides no account or cloud progress
sync. Resetting progress removes the saved learning records and confusion history.

Bird photos load from Wikimedia servers. Photo requests disclose ordinary
network request information to that provider. Opening a source or credit link
launches the linked website in your browser, where that website's policies apply.

The beta uses Apple's TestFlight distribution and feedback services. Apple
provides the developer with tester activity, device/build information, crash
reports, and feedback submitted through TestFlight. BeakSpeak includes no
third-party analytics or advertising SDK.

This is review text, not a published privacy-policy URL or a completed App Store
privacy declaration. Verify the shipping archive and dependencies before making
those declarations. Insert the owner's feedback contact in the published policy.

## Archive and acceptance evidence

Use the existing native workflow; generated packaged assets must not be edited:

```bash
cd beakspeak
npm run native:sync
npm run native:open
```

### Xcode Cloud

The owner connected this repository to Xcode Cloud on 2026-10-08. The first
Default workflow build checked out `564ace5` successfully, then failed while
resolving the local Capacitor Swift packages because `beakspeak/node_modules`
did not exist. That confirms repository access; it does not confirm a usable beta.

The executable `beakspeak/ios/App/ci_scripts/ci_post_clone.sh` installs Node 22,
ffmpeg, and uv through Cloud's Homebrew, installs the locked npm dependencies,
reconstructs the locked production audio with Python 3.12, and runs the existing
native synchronization before Swift package resolution. The hook must be
committed and pushed to the branch selected by the Cloud workflow. It does not
require an XC API key or commit generated web assets.

The first workflow used a Build action. The saved **Default** workflow now has
an Archive action for the App scheme, **App Store Connect** distribution
preparation (eligible for all testers and customers), and restricted editing.
Xcode confirmed the existing BeakSpeak app record and connected the Cloud product
for distribution. It also created a separate Internal TestFlight Build workflow;
use Default for the normal distribution artifact required by #31.

Add the internal group as a TestFlight post-action after the group exists.
Retain the source lock and ordinary signing; do not force automatic Swift package
resolution. The fixed branch was pushed as `codex/xcode-cloud-testflight`, but
Xcode's build-source picker still listed only the three older branches when
checked. No second build was started against an outdated source. A successful
hosted build remains pending; after merging the setup fix into main, run Default
against main and verify the post-clone, archive, and upload results.

References: [Apple custom scripts](https://developer.apple.com/documentation/xcode/writing-custom-build-scripts),
[Cloud dependencies](https://developer.apple.com/documentation/xcode/making-dependencies-available-to-xcode-cloud),
[distribution workflows](https://developer.apple.com/documentation/xcode/creating-a-workflow-that-builds-your-app-for-distribution).

Archive the App scheme in Release for an iOS device. Keep automatic signing with
the confirmed paid team and retain uploaded symbols. Audit the actual archive for
identity, version/build, bundled content, permissions, and dependency privacy
manifests before uploading.

The SQLite plugin links SQLCipher with database encryption disabled. The actual
archive was audited before the owner confirmed the portal answer. The disabled
setting alone does not establish an exemption.
[Apple export-compliance guidance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/).

For the uploaded `2.0.0 (1)` archive, the follow-up audit found SQLCipher's
CommonCrypto provider symbol and Apple CCCryptor/CCHmac/PBKDF/Security imports.
The plugin's JSON encryption helpers use Apple's CryptoKit/CommonCrypto.
Capacitor's hash helper uses CommonCrypto, and the bundled Dexie promise scheduler
uses WebCrypto SHA-512. The app's own source has no encryption implementation;
no additional non-OS implementation was found in the inspected source,
dependencies, JavaScript assets, or native symbols.

The recommended technical answer to Apple's exact algorithm question is
**None of the algorithms mentioned above**, meaning neither proprietary
algorithms nor standard algorithms implemented outside Apple's OS. This is an
inference from the audit and Apple's OS-only category, not a claim that the
binary contains no cryptographic capability or a formal ruling on every export
obligation. The owner confirmed this answer on 2026-10-08; Apple accepted it and
allowed internal-group assignment without further documentation in this flow.
The source Info.plist now declares `ITSAppUsesNonExemptEncryption = false` for
future builds with the same reviewed implementation. The existing uploaded
archive did not contain that key; its answer was supplied in App Store Connect.
[Apple's algorithm categories](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption/),
[detailed research](../rpi/research/testflight-human-checkpoints-2026-10-08.md#addendum-shipping-builds-algorithm-question).

Evidence as of 2026-10-08:

- Merged-build CI passed, including native simulator smoke:
  [run 37841313627](https://github.com/avoidthekitchen/avilingo-v2/actions/runs/37841313627).
- `npm run native:sync` passed locally, including type/build checks and validation
  of all 30 production audio clips.
- The existing Capacitor decision is recorded in
  [ADR-0001](adr/0001-adopt-capacitor-for-ios.md). The physical-iPhone feasibility
  result is recorded on [issue #30](https://github.com/avoidthekitchen/avilingo-v2/issues/30#issuecomment-5689014818).
- Xcode confirmed the BeakSpeak App Store Connect record and completed Cloud
  distribution setup. Default's archive action and editing restriction were saved.
- Bash syntax, ESLint, and all 23 root tooling tests passed for the Cloud hook.
- Local Xcode archive `2.0.0 (1)` completed on 2026-10-08. The archive has the
  permanent bundle ID, iOS 18.4 minimum, all 30 manifest-referenced audio clips,
  and the Capacitor, Cordova, SQLCipher, and ZIPFoundation privacy manifests.
- Apple's Organizer validation passed all checks for `2.0.0 (1)`.
- Organizer confirmed a successful normal App Store Connect upload of `2.0.0 (1)`.
  Local evidence is stored in ignored `.artifacts/testflight/local-upload-complete.jpg`
  and `.artifacts/testflight/archive-audit.json`.
- The beta description and supplied Gmail plus-address feedback contact were
  accepted and saved in App Store Connect. Internal Beta was created with manual
  build assignment; App Store Connect confirmed the owner as its first tester.
- Both GitHub CI jobs passed for the setup PR, including iOS simulator smoke.
- The current implementation passed typecheck, lint, all 230 application and
  23 root tooling tests, and both local native smoke tests (iPhone 18 Pro /
  iOS 27.0). Browser E2E was not rerun locally for these documentation/account
  changes; the GitHub web job already covers that suite.
- Build-specific What to Test was saved and verified on `2.0.0 (1)`, including
  beta scope, earlier browser-storage no-migration, and keeping the app installed
  for the later #32 update check.
- Apple processed `2.0.0 (1)` as build `42ee5d0e-acf9-4331-8221-9dd5a5c2e69e`.
  The owner completed the encryption answer; the compliance gate cleared and the
  build was added to Internal Beta with status **Testing**. The owner is its first tester, with status
  **Invited** on 2026-10-08.
- The owner sent the Marketing invitation after the BeakSpeak selection step.
  Apple's pending-user list displays **All Apps** and disables Edit App Access
  for that invitation. BeakSpeak is the only registered app. After acceptance,
  verify and explicitly narrow access to BeakSpeak after acceptance. On
  2026-10-08 the owner explicitly accepted the invitation stage as complete for
  the first beta and deferred waiting for partner acceptance/installation.
  Partner follow-up does not block this first-beta handoff. Owner installation
  and TestFlight diagnostics evidence remain pending.

Close #31 after the owner's installed-beta and diagnostics checks, plus the
remaining ownership/privacy confirmations, have evidence. Partner acceptance,
scope verification, and installation are explicitly deferred at the owner's
request for this first beta. Record app/build identifiers, device/iOS versions,
and the results. The ordinary SQLite-to-SQLite TestFlight
update and deeper storage inspection remain the separate
[issue #32 gate](native-storage.md#physical-device-testflight-gate-pending).

## Human completion checklist for #31

### Creator-credit update — 2026-10-09

The About page now displays **Created by Jason Wu and Armand Ian Lucas**.
Local archive `2.0.0 (2)` includes this credit and retains the permanent bundle
identifier and owner-confirmed encryption declaration. Typecheck, lint, all
230 app / 23 tooling unit tests, native synchronization, and both native smoke
tests passed. The credit was also checked through About in the browser.
The owner renewed the Xcode account session and Organizer confirmed a successful
normal App Store Connect upload of `2.0.0 (2)` on 2026-10-09. Apple processed build
`c74efe5c-78ec-47e6-ba14-2e86e0bf2642` and Internal Beta now shows both builds with
status **Testing**. Build-specific What to Test was saved, including the creator
credit and updating without deletion to check progress preservation. Build 1 remains available.
After build 2 is processed and assigned to Internal Beta, use TestFlight's Update
button without deleting the installed app, and check that existing progress remains.

The successful upload alone does not complete the issue. Use this checklist to
record the remaining account decisions and installed-beta evidence.

| Check | Who | Evidence needed |
|---|---|---|
| Individual-account seller identity | Owner | Legal-name seller acceptance confirmed on 2026-10-09; Individual means enrollment in the owner's personal name rather than an organization |
| Encryption/export determination | Completed for this build | Owner-confirmed OS-only algorithm answer accepted; reassess when the implementation changes |
| Collaborator invitation | Completed for the first beta | Marketing invitation sent with BeakSpeak selected; owner deferred acceptance and app-scope verification/narrowing as later follow-up |
| Distributed build installed | Owner now; bird expert later | TestFlight version/build plus device/iOS, successful cold launch, and one short lesson/quiz/review/Progress pass |
| TestFlight diagnostics | Owner / release operator | Verify installation status, device details, sessions, and access to the crash-feedback views |
| Screenshot feedback | Owner now; bird expert later | Submit one TestFlight screenshot with a short note and verify it arrives in App Store Connect |

A clean run need not produce a crash to prove that the crash-feedback view is
available. Do not deliberately crash the app or add an analytics SDK for this
check. Keep the app installed for the later #32 update-preservation gate.

Record observations here or on #31 without including private tester addresses,
device identifiers, or feedback payloads in public repository files:

| Person | Version / build | Device / iOS | Installed and launched | Session visible | Screenshot feedback received |
|---|---|---|---|---|---|
| Owner | 2.0.0 (1) | iPhone 15 / iOS 26.6.2 (TestFlight verified 2026-10-09) | Owner confirmed installed/opened and seems to work on 2026-10-09; Apple shows Installed; testing still in progress | Not yet shown | Pending |
| Bird expert | Pending | Pending | Pending | Pending | Pending |

The learner smoke is deliberately short: introduce birds through one lesson,
complete its quiz, use Review when available, inspect Progress, play a sound, and
force-quit/relaunch to confirm the app opens safely. Silent-switch audio,
background recovery, VoiceOver, and larger text remain useful device checks;
do not mark unperformed checks as passed. Do not substitute a direct Xcode
installation or a simulator run for installation through TestFlight.

### Deferred partner follow-up

After Armand accepts the App Store Connect invitation, verify/narrow his app
access to BeakSpeak, add him to Internal Beta, and verify the same-build install
and screenshot feedback. The owner's 2026-10-08 instruction explicitly defers
waiting for these steps; invitation sending is done for this first-beta scope.
