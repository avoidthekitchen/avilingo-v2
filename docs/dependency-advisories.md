# Dependency advisory remediation

The October 7, 2026 audit reported 22 advisories, including the native Capacitor internal proxy navigation issue ([GHSA-rvm3-566m-v7fv](https://github.com/advisories/GHSA-rvm3-566m-v7fv)). Capacitor core/iOS/CLI are updated together to 8.5.3, including the Swift package pin and resolved revision. Vite 8.3.3, Vitest 4.1.11 and Wrangler 4.148.0 clear affected build-tool dependencies; compatible transitive fixes are retained in the lockfile.

Two scoped overrides remove remaining upstream ranges: Miniflare uses Sharp 0.35.5 or later for the [librsvg advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), and xcode uses UUID 11.1.1 or later for the [buffer bounds advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq). UUID 11 preserves CommonJS and the v4 API xcode consumes. Remove overrides once the upstream dependencies accept patched ranges.

After installation, npm audit reports zero findings. This is a point-in-time dependency result. Compatibility checks cover Xcode project parsing/serialization/UUID generation, Sharp SVG-to-PNG and image metadata, typecheck, lint, units, browser learner flows, native synchronization/smoke, and Worker dry-run packaging.
