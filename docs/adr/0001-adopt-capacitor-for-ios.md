# ADR-0001: Adopt Capacitor for the iOS Release

## Status

Accepted — 2026-09-15

## Context

BeakSpeak is a React/Vite bird-song trainer that is already delivered on the
web. The product also needs an installable iPhone app suitable for TestFlight
and App Store distribution, without duplicating the learning experience,
review logic, content pipeline, and progress model in a separate UI codebase.

The project ran a deliberately reversible Capacitor feasibility phase. The
phase established an iOS project, separate web and native builds, native
lifecycle handling, audio recovery behavior, and a narrow XCTest smoke suite.
The simulator smoke complements the existing Playwright product-flow coverage;
physical-device checks remain the evidence for device-specific concerns such as
audibility with the silent switch, lifecycle behavior, signing, and VoiceOver.

The feasibility gate has now passed and the product owner has chosen to make
Capacitor the release architecture for iOS.

The owner recorded the physical-device evidence on
[issue #30](https://github.com/avoidthekitchen/avilingo-v2/issues/30#issuecomment-5689014818)
on 2026-09-15: iPhone 15, iOS 26.6.2; Learn → introductory quiz → review →
Progress and Skip Ahead passed; background/foreground navigation and audio
recovered; termination and cold relaunch worked; and external credit/source links
opened in the browser. The owner reported no crashes or performance problems in
that session. Forced photo failure and VoiceOver were explicitly deferred, so
this decision does not claim physical-device evidence for those checks.

## Decision Drivers

- Preserve a single React application and shared learning-domain logic.
- Retain the existing Cloudflare-hosted web experience.
- Ship bundled bird audio and interface assets for reliable offline use.
- Provide a native iOS binary and access to native APIs when the web runtime is
  insufficient.
- Keep platform-specific behavior contained to build configuration and adapter
  boundaries.
- Avoid a premature React Native rewrite while the web-based learner experience
  satisfies the product requirements.

## Considered Options

### Capacitor iOS shell

Package the existing React/Vite application in a Capacitor-managed iOS project.
Use a native build with relative asset URLs and synchronize the generated web
bundle into the iOS application.

### React Native / Expo rewrite

Reimplement the app UI in native views while preserving only selected shared
domain code.

### Web-only distribution

Continue delivering only the Cloudflare-hosted web application.

## Decision

Use **Capacitor** as BeakSpeak's iOS release architecture. Continue to ship the
same React application as both:

- the web build at `/beakspeak/`; and
- the native build packaged in the Capacitor iOS shell.

Only iOS is configured at this time. Android is not implicitly committed by
this decision and must be evaluated separately before it is added.

Native-only behavior must remain behind build configuration or adapter
boundaries. Learning components should not accumulate platform checks. The
packaged web bundle under `ios/App/App/public/` remains generated output and
must not be edited directly.

## Consequences

### Positive

- One product UI and learning model serve web and iOS, reducing duplication and
  keeping learner behavior consistent.
- BeakSpeak can be installed, distributed through TestFlight and the App Store,
  and use native capabilities when required.
- Bundled assets support the audio-first experience without depending on a
  network connection after installation.
- Playwright remains the primary product-flow suite, while XCTest stays focused
  on native integration seams.

### Negative

- The team must maintain the Capacitor dependency set, the Xcode project, and
  the `native:sync` packaging workflow in addition to the web build.
- The iOS app runs in a WKWebView, so audio, storage, lifecycle, performance,
  and accessibility need ongoing testing on physical devices.
- Some product needs may still require native plugins or focused Swift work.

### Risks and Guardrails

- Continue physical-device validation for silent-switch audio, lifecycle
  recovery, performance, persistence, and VoiceOver; simulator evidence alone
  is insufficient.
- Treat persistent requirements for substantial native UI replacement or
  pervasive platform-specific code as a reason to reopen this decision and
  evaluate React Native / Expo.
- Keep the web and native build modes explicit: web assets use `/beakspeak/`
  URLs, while native assets use relative URLs.
- Retain the permanent bundle identifier `com.unformedideas.beakspeak` across
  TestFlight and App Store updates. The earlier feasibility identity is disposable.

## Related Documentation

- [iOS build, smoke, and physical-device procedure](../native-ios.md)
- [Capacitor iOS feasibility specification](../../rpi/plans/capacitor-ios-app-spec-2026-08-27.md)
- [Mobile architecture evaluation](../../rpi/research/mobile-app-options-2026-08-26.md)
