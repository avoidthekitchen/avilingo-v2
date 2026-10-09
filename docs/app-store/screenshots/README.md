# BeakSpeak iPhone screenshots

Captured October 9, 2026 from the installed Release configuration of
`com.unformedideas.beakspeak`, version 2.0.0, build 2, after `npm run native:sync`.
Source baseline: `c3fb6314a1ee8620d1ab1775041cd6cc525f5a32` plus issue #33's
About support/privacy links. The remaining new files are public information and
collateral; they do not alter the captured learner flow.

| Asset | Device / OS | Visible state |
|---|---|---|
| `01-five-lessons-1320x2868.jpg` | iPhone 17 Pro Max / iOS 26.5 | Fresh Learn list, five lessons, 0 of 15 introduced |
| `02-listen-to-birds-1320x2868.jpg` | iPhone 17 Pro Max / iOS 26.5 | Lesson 1 American Crow card, real photo, song/call controls and spectrogram |
| `03-listening-quiz-1320x2868.jpg` | iPhone 17 Pro Max / iOS 26.5 | First real introductory quiz question after navigating all three cards |
| `04-five-lessons-1206x2622.jpg` | iPhone 17 Pro / iOS 26.5 | Fresh Learn list at the medium Dynamic Island display size |

Upload 01–03 in the large Dynamic Island iPhone slot and 04 in the medium slot.
Apple's current [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
list a medium Dynamic Island iPhone screenshot as required. No iPad screenshots
are provided because this app targets iPhone only. Confirm portal requirements
again at submission.

All four JPEGs retain the native resolution and have no alpha channel. Captures
include only the app screen, without desktop/browser chrome, added marketing
text, cropping, resized UI, or invented state. Actual Wikimedia photos loaded
over the network; no test fixture or substitute image was used. Recording/photo
credits remain in About and [content licenses](../../content-licenses.md).

XcodeBuildMCP performed the Release build, install, and launch. Device Hub was
navigated through the visible controls with computer use. Its screenshot helper
returned only 368×800 images, so native-resolution captures used
`xcrun simctl io <simulator-id> screenshot`. The first two PNG captures were
converted with `sips -s format jpeg` solely to remove alpha; subsequent captures
used `--type=jpeg` directly. `sips` verified all dimensions and `hasAlpha: no`.
These are simulator screenshots, not claims of new physical-device testing.

To refresh: synchronize native assets, build/run Release on these simulator
sizes, launch with fresh test progress, capture the lesson list, open Lesson 1,
capture its first bird, and navigate to Start Quiz for the question capture.
Inspect every image for settled layout and loaded photos before uploading.
