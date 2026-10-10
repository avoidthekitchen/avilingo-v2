# App Store collateral — issue #33

Prepared October 9, 2026 for the free, account-free initial iPhone release.
Originating specification: [issue #33](https://github.com/avoidthekitchen/avilingo-v2/issues/33)
and [parent #25](https://github.com/avoidthekitchen/avilingo-v2/issues/25).
This packet prepares metadata; it does not submit the app for review.

## English (U.S.) metadata

| Field | Copy / selection |
|---|---|
| Name | BeakSpeak: Learn Bird Songs |
| Subtitle | Seattle birds, songs and calls |
| Promotional text | Learn 15 Seattle-area birds through five guided lessons, listening quizzes, and spaced repetition reviews. Free, with no account required. |
| Keywords | birding,birdsong,birdwatching,seattle,pacific northwest,nature,listening,identification,calls |
| Primary category | Education |
| Secondary category | Reference |
| Price | Free; no in-app purchases |
| Platform | Portrait iPhone, iOS 18.4 or newer |
| Support URL | https://beakspeak.app/beakspeak/support/ |
| Public support contact | support@beakspeak.app (owner-confirmed receipt, 2026-10-09) |
| Privacy Policy URL | https://beakspeak.app/beakspeak/privacy/ |
| Marketing URL (optional) | https://beakspeak.app/beakspeak/ |

### Description

Learn to recognize Seattle-area birds by their songs and calls.

BeakSpeak introduces 15 birds across five guided lessons. Listen to real bird
recordings, explore sound descriptions and spectrograms, then practice with
short listening quizzes. Spaced repetition reviews help you revisit the birds
you have learned over time.

Start with distinctive birds such as the American Crow, Steller's Jay, and
Northern Flicker, then work through the remaining lessons. Track introduced
birds and upcoming reviews in Progress. Being introduced to a bird is a first
step; continued listening practice builds recognition.

Features:
- Five guided lessons with 15 Seattle-area species.
- Bird songs and calls, replay controls, and interactive spectrograms.
- Introductory quizzes and spaced repetition reviews.
- Progress saved on your iPhone, with a reset option.
- Recording and photo source credits in About.

Free to use, with no account, advertising, or subscriptions. Bird photos,
recordings, and learning content are bundled with the iPhone app, so lessons,
quizzes, and reviews work without an internet connection. Source and support
links open in your browser and need one. Progress is local to your device and
does not sync with the web demo or other devices.

### Age-rating questionnaire

Expected global rating: **4+**, subject to Apple's generated regional ratings.
This is a general-audience educational app, not an application submitted to the
Kids category. Do not set a higher age override or age-assurance requirement.

Answer **No** for parental controls, age assurance, advertising, user-generated
content, messaging/chat, and unrestricted web access. Credit links open specific
sources in the external browser; there is no embedded open-web browser or social
feed. Answer **None** for profanity/crude humor, horror/fear, alcohol/tobacco/drug
references, medical/treatment information, mature/suggestive themes, sexual
content/nudity, graphic sexual content, cartoon/fantasy violence, realistic
violence, prolonged graphic/sadistic violence, and weapons. Answer **No** for
gambling, simulated gambling, contests with prizes, and loot boxes. Listening
quiz scores do not involve gambling or prizes. If the portal adds questions,
assess the actual feature rather than reusing an old questionnaire blindly.
See [Apple's questionnaire](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/).

## App Review notes (paste-ready)

BeakSpeak is a free bird-song trainer for portrait iPhone (iOS 18.4+). No login,
account, purchases, subscription, or reviewer credentials are required.

Start in Learn and open Lesson 1: The unmistakable three. Read/listen to the three
bird cards, use Next, and select Start Quiz on the final card. Answer the five
introductory questions, continue to the lesson list, then open Quiz to start a
review. Progress shows introduced birds and review scheduling. About lists
recording/photo credits and public Support and Privacy links.

Photos and audio are bundled: all 15 bird photos, all 30 production bird
recordings, and the learning content ship in the app, and the learner flow makes
no network requests. Lessons, quizzes, and reviews work in airplane mode. Credit,
Support, and Privacy links open external pages in the browser and need a
connection.

Tap a play control to start/replay a sound. If automatic playback is blocked,
Tap to play sound retries immediately. Spectrograms support seeking. In
same/different review questions, the second recording follows the first.
Playback stops when backgrounded or locked; there is no background audio or
lock-screen player.

Learning progress and quiz confusion history are saved locally in native SQLite,
eligible for device backups according to the user's settings. No cloud progress
sync is provided. Progress > Reset All Progress > Yes, Reset deletes local
learning data. An interrupted session starts safely at the lesson list after
process termination; it does not resume an exact question or playback position.

App Review's private contact fields must use the owner's current name, phone,
and monitored email from App Store Connect; do not fabricate these fields.

## Privacy answers and evidence

The app contains no account service, advertising, analytics/attribution SDK,
tracking domains, or custom crash telemetry. **Tracking: No.** No ATT permission
is requested. Local progress/confusion data is not transmitted and is therefore
not collected for Apple's label. No microphone, photo-library, camera, contacts,
or location permission is requested.

Dependency/archive evidence: `beakspeak/package-lock.json`,
`beakspeak/capacitor.config.ts`, `beakspeak/ios/App/App/Info.plist`, and the actual
archive audit recorded in [the beta release evidence](testflight-beta.md).
Capacitor, Cordova, SQLCipher, and ZIPFoundation manifests in that audit declare
no collected data or tracking; required-reason local file/disk API entries are
distinct from collection. An empty SDK manifest alone does not establish that
all runtime network providers collect nothing.

Bird photos are bundled ([#70](https://github.com/avoidthekitchen/avilingo-v2/issues/70)),
so the app no longer requests images from Wikimedia. Earlier builds did, and
those requests revealed IP addresses and request headers to Wikimedia under its
[privacy policy](https://foundation.wikimedia.org/wiki/Policy:Privacy_policy).
Do **not** infer “Data Not Collected” solely from the absence of analytics SDKs.
Apple's [label guidance](https://developer.apple.com/app-store/app-privacy-details/)
covers data collected by the app *and* its third-party partners, including any
runtime network provider. The evidence for this label is the submitted build's
observed network behavior, not the source tree alone.

Automated evidence: the Playwright fixture fails any test whose page requests a
host other than the app's own origin. `bundled-photos.spec.ts` walks Credits,
the lesson list, a lesson card, the introductory quiz, Progress, and a review,
and checks that every photo decoded from the bundle. The native app runs the
same React code from its packaged files.

### Prepared portal responses

Select **Data Not Collected**. Use it only for a build that bundles its photos.
Mark it in App Store Connect only when that build is the one submitted, and only
after the native network check below passes on it.

No build is submitted until this work is done. Builds 1–4 load photos from
Wikimedia and must not be submitted. Build 5 is the first build archived with
bundled photos.

Native network check, required for the submitted build: install it on a device or
simulator, then complete a lesson, its introductory quiz, a review, Progress, and
About in airplane mode. Every photo must appear (no bird illustrations), and
audio must play. Then repeat with network inspection (for example a proxy or
Xcode's network instrument) and confirm the learner flow makes no requests at all.
Record the build number, date, and method below before changing the label.

| Build | Date | Method | Result |
|---|---|---|---|
| 5 | 2026-10-09 | Owner, on a physical iPhone 15 running iOS 27 | No network requests observed during learning |

Support email is not declared (owner decision, 2026-10-09). Apple's label
covers data the app transmits off the device. BeakSpeak has no in-app support
form and never sends support messages: its About page links to the public
Support page, and any email is composed and sent by the user's own mail app.
Re-declare Email Address and Customer Support if an in-app feedback or support
form is ever added.

Do not select local learning progress, quiz answers, confusion history, bundled
bird recordings, user/device IDs, precise location, purchases, contacts, or
microphone audio: the app does not transmit those data. External source pages
open in the user's browser, not an embedded unrestricted web view. Apple's own
platform collection is Apple's responsibility; the shipping app adds no Apple
analytics framework or custom crash collector. TestFlight feedback and any
individual diagnostic reports retained by the developer must be reassessed if
repurposed into a shipping data-collection workflow.

At submission, the owner should confirm that support is used only as described,
that the shipping archive contains only the dependencies audited above, that the
native network check is recorded for that build, and that no additional
telemetry or retained individual diagnostics have been introduced. Update the
public Privacy page, these App Review notes, and the portal answers together so
they all describe the submitted build. No portal declaration has been made here.

## Export compliance

Retain `ITSAppUsesNonExemptEncryption = false` for the reviewed implementation.
For Apple's question about proprietary algorithms or standard algorithms not
provided by Apple's OS, the prepared response is **None of the algorithms
mentioned above**. The owner confirmed this for the uploaded beta and Apple
accepted it. This answer describes OS-provided cryptography, not absence of
cryptographic capability.

The archive audit found SQLCipher using Apple's CommonCrypto provider,
CryptoKit/CommonCrypto helpers, Capacitor hashing, and bundled Dexie WebCrypto.
Database encryption is disabled; that setting alone is not the exemption basis.
Re-audit if dependencies, crypto features, or the archive change. See
[beta audit](testflight-beta.md) and
[Apple's OS-only category](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption/).

## Screenshot assets

See [screenshots and provenance](app-store/screenshots/README.md). Use unaltered
captures of the installed portrait app, with real learner-visible navigation
and synthetic local learning progress. No browser chrome, fabricated screens,
mock photos, added features, or offline promises belong in store screenshots.
Recheck [Apple's current screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
at upload; required device slots can change.

## Publication and submission checklist

- Publish the support contact only after its monitored destination is confirmed.
  The owner confirmed receipt at `support@beakspeak.app` on 2026-10-09.
- Build with `bash scripts/build-site.sh` and deploy using the existing Worker.
  Public BeakSpeak pages live under `beakspeak.app/beakspeak/`; `/whistlewood/`
  belongs to the whistlewood repo. Deploy the unformedideas repo's legacy
  redirect before removing old routes, so `unformedideas.com/beakspeak/...`
  links shipped in TestFlight build 2 keep working (see ADR 0002).
- Check demo, Support, Privacy, and stylesheet on `beakspeak.app` without
  authentication from an external fetcher, including navigation back to the
  demo. Also check that legacy `unformedideas.com/beakspeak/support/` and
  `/privacy/` return 301 to their `beakspeak.app` equivalents, and that an
  unknown `/beakspeak/...` path returns 404. A SPA fallback response is not proof the information page works.
- Record the live check results and the mail-routing/receipt evidence.
- Paste metadata and review notes into App Store Connect; select the shipping
  build, fill private review contact, confirm the prepared privacy responses, and
  upload screenshot assets. Release submission remains a separate owner action.
