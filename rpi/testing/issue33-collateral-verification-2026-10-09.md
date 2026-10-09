# Issue #33 verification — October 9, 2026

Baseline: `c3fb6314a1ee8620d1ab1775041cd6cc525f5a32`.
Current branch: `codex/custom-bird-assets`.
Existing skills/documentation changes were present before work began and are
excluded from this issue's commit.

## Scope and checks

- Public Support and Privacy HTML and a local stylesheet are delivered by Vite
  under `/beakspeak/`; the app's About page exposes both public destinations.
- Owner selected `support@verybusypeople.com` after a read-only mail check.
  Public MX records use Cloudflare. Authenticated routing inspection found an
  enabled forwarding catch-all, covering the support address. No mail records
  or routing rules were changed, and no test email was sent. Receipt is not
  independently proven.
- `unformedideas.com` uses Namecheap forwarding MX records, while Cloudflare
  Email Routing is unconfigured. It was not changed or used as the support
  address.
- Owner agreed the public-page/browser-navigation test seam. Removing the new
  page directories temporarily made the page test fail: HTTP 200 returned the
  demo fallback title instead of Support. Restoring the pages made both new
  tests pass. This catches false-positive SPA-fallback availability checks.
- Typecheck and lint passed. Full unit suite: 230 application tests and 23 root
  tooling tests passed. Full browser suite: 15 tests passed, including the two
  new public information tests. Console errors remain enforced by the fixture.
- `bash scripts/build-site.sh` passed, including offline manual audio checking
  and pruning to the 30 production clips. Existing Worker route patterns remain
  unchanged. Public pages occur only in `dist/beakspeak/`; `dist/index.html`
  remains the app's Worker SPA fallback.
- Native synchronization and Release build/run passed on iPhone 17 Pro Max /
  iOS 26.5. The same Release app installed/launched on iPhone 17 Pro / iOS 26.5.
  Four native-resolution opaque JPEG captures are included with provenance.
- XCTest was not rerun: no native configuration, lifecycle, storage, or startup
  implementation changed. The shared About links are covered in Playwright;
  simulator build/launch and capture provide additional packaging evidence.
- No App Store metadata, privacy answers, or release submission was published
  in App Store Connect. The packet distinguishes prepared responses from portal
  actions and identifies the remaining privacy-classification submission gate.

## Public publication

Pending deployment and external unauthenticated URL verification.

## Independent review

Pending standards/spec review against the baseline.
