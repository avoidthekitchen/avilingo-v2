# Issue #33 verification — October 9, 2026

Baseline: `c3fb6314a1ee8620d1ab1775041cd6cc525f5a32`.
Initial branch: `codex/custom-bird-assets`; checkout changed externally to `main`
before commit. Issue #33 was committed on the then-current `main` branch.
Review baseline: `f147bd24b163c7c9b66b06f60fa0432efbbd2a00`, excluding the
intervening artwork commit from issue #33 review.
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
  actions and provides explicit conservative privacy responses for owner confirmation before
  portal publication.

## Public publication

Published the existing BeakSpeak Worker with version ID
`1d3165e2-51a7-4596-8b16-721d9a787ef9`. All four route patterns remain confined
to `/beakspeak` and `/beakspeak/*` on apex and www hostnames.

Unauthenticated HTTPS checks against the public deployment (not the development
server) returned 200 on both hostnames:

| Path | Content type / title |
|---|---|
| `/beakspeak/` | `text/html`, BeakSpeak |
| `/beakspeak/support/` | `text/html`, Support · BeakSpeak; chosen email present |
| `/beakspeak/privacy/` | `text/html`, Privacy · BeakSpeak; chosen email present |
| `/beakspeak/information.css` | `text/css` |
| `/` | `text/html`, Unformed Ideas (separate root preserved) |

The separate unauthenticated in-app browser confirmed Support → Privacy → demo
navigation and the five loaded lessons with 0 of 15 birds introduced. Local
browser fixtures were not used for this public check. Raw curl results are saved
in ignored `.artifacts/app-store/public-url-checks.json`. The external web-reader
service could not access the domain; Python urllib also received 403. Curl and
the actual browser both succeeded without authentication. No security settings
were changed. An independent off-machine check through Jina Reader then successfully fetched
the canonical Support, Privacy, and demo URLs, returning the correct titles,
policy content, chosen support contact, and all five rendered lessons without
authentication. Only public URLs
were supplied to that service; no private content or credentials were sent.

## Independent review

Reviewed only the issue #33 commit against
`f147bd24b163c7c9b66b06f60fa0432efbbd2a00`; unrelated changes were excluded.

### Standards

No Standards findings. The changes preserve the `/beakspeak/` deployment
boundary, shared React UI, adapter boundary, generated native assets, and
Playwright product-flow ownership. Backup/reset descriptions agree with native
storage documentation. Screenshot provenance distinguishes simulator captures
from physical-device evidence. No actionable baseline smells were identified.

### Spec

The initial review found one partial requirement: privacy responses stopped at
assessment rather than offering explicit prepared portal answers. The corrected
packet supplies conservative responses, purpose/linkage selections, and evidence
for remote photo requests and voluntary support. A second independent review
confirmed that correction resolves the finding, with no scope creep or other
incorrect implementation. Metadata has not been submitted to Apple.

Final review findings: Standards 0; Spec 0. Off-machine public-page checks passed
as recorded above.

## Later change (same day): move to beakspeak.app

After this record, the owner moved BeakSpeak's public home to `beakspeak.app`
and switched the support contact to `support@beakspeak.app` (receipt confirmed
by the owner). See `docs/adr/0002-move-public-web-presence-to-beakspeak-app.md`.
The route and fallback results above describe the earlier deployment.

Rollout: the unformedideas Worker was deployed first with `_redirects`
(version `b58cdff9-d041-4610-8aee-7e34adf70ece`), then this Worker with only
the `beakspeak.app` custom domains (version
`e6fb09c9-8986-4bea-a4b5-48d782cc2d1a`). `wrangler deploy` did not remove the
four old `unformedideas.com/beakspeak*` zone routes; they were deleted through
the Cloudflare API with owner approval.

Unauthenticated HTTPS checks against the public deployment:

| URL | Result |
|---|---|
| `beakspeak.app/`, `www.beakspeak.app/` | 200, BeakSpeak landing page |
| `beakspeak.app/beakspeak` | 307 to `/beakspeak/` |
| `beakspeak.app/beakspeak/` | 200, BeakSpeak app |
| `beakspeak.app/beakspeak/support/` | 200, Support · BeakSpeak; `support@beakspeak.app` present |
| `beakspeak.app/beakspeak/privacy/` | 200, Privacy · BeakSpeak; `support@beakspeak.app` and Wikimedia analytics disclosure present |
| `beakspeak.app/beakspeak/information.css` | 200, `text/css` |
| `beakspeak.app/beakspeak/nope`, `beakspeak.app/nope` | 404, Not found · BeakSpeak |
| `beakspeak.app/whistlewood/` | 200, Whistlewood (whistlewood repo) |
| `unformedideas.com/beakspeak`, `/beakspeak/`, `/beakspeak/support/`, `/beakspeak/privacy/?x=1` and `www.` variants | 301 to the same path on `beakspeak.app` (query preserved) |
| `unformedideas.com/`, `unformedideas.com/biopunk/` | 200, unrelated routes unaffected |
