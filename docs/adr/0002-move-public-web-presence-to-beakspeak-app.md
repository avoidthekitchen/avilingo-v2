# ADR-0002: Move BeakSpeak's Public Web Presence to beakspeak.app

## Status

Accepted — 2026-10-09

## Context

BeakSpeak's web demo, and the public Support and Privacy pages prepared for the
App Store in issue #33, were served from `unformedideas.com/beakspeak/`. That
host belongs to a personal landing page with unrelated projects. This repo's
Worker held only the four `unformedideas.com/beakspeak*` routes, and the root
page was owned by the separate `unformedideas` repo.

The owner registered `beakspeak.app` as a dedicated BeakSpeak domain. Whistlewood,
a related bird-listening game, already deploys to `beakspeak.app/whistlewood/`
from its own repo. A `support@beakspeak.app` mailbox now receives mail.

TestFlight build 2 is already installed on tester devices. Its About page links
to `https://unformedideas.com/beakspeak/support/` and `/privacy/`.

## Decision

- `beakspeak.app` (apex is canonical; `www` also served) is the public home for
  BeakSpeak, its App Store Support/Privacy/Marketing URLs, and related projects
  such as Whistlewood.
- This repo's Worker serves `beakspeak.app` and `www.beakspeak.app` as custom
  domains: a landing page at `/`, a not-found page, and the app plus its public
  pages under `/beakspeak/`. Unknown paths return 404 instead of an SPA fallback,
  because the app has no client-side path routes.
- `/whistlewood/*` stays owned by the `whistlewood` repo through more specific
  Worker routes.
- `unformedideas.com` stays a landing page owned by the `unformedideas` repo. It
  links to `beakspeak.app` and 301-redirects `/beakspeak` and `/beakspeak/*` to
  the same paths on `beakspeak.app`.
- The public support contact is `support@beakspeak.app`.
- The iOS bundle identifier remains `com.unformedideas.beakspeak`. It is a
  permanent App Store identity, not a URL, and cannot change after a build has
  been uploaded.

## Consequences

- Rollout order matters. Deploy the `unformedideas` redirect first; it has no
  effect while this Worker still holds the more specific
  `unformedideas.com/beakspeak*` routes. Then deploy this Worker without those
  routes, so the redirect takes over without a gap.
- The legacy redirect must stay in place while any shipped build or published
  listing still links to `unformedideas.com/beakspeak/`.
- App Store Connect Support, Privacy Policy, and Marketing URLs move to
  `beakspeak.app`. The next build's About links point there directly.
- Issue #33's public-URL verification must be re-run against `beakspeak.app`,
  including the legacy redirects and 404 behavior.
