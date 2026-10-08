# Native SQLite storage verification — 2026-10-08

Verified `codex/native-sqlite-storage` at `4fd2c37` against refreshed
`origin/main` at `6f8895ab8dac80a07a60d85f284a1f2481665b6e`, plus the local
test compatibility and documentation corrections described below.

## Results

| Check | Result | Coverage |
|---|---|---|
| `npm run typecheck` | Passed | Application TypeScript, including adapter tests |
| `npm run lint` | Passed | Application and root JavaScript tooling |
| `npm run test:unit` on Node 26.10.0, before correction | 215 application + 20 tooling tests passed | Existing complete unit layer |
| SQLite contract test on Node 22.23.3, before correction | Failed before collecting tests | Reproduced PR #65's web CI failure |
| SQLite contract test on Node 22.23.3, after correction | 19 tests passed | Real SQLite adapter/transaction behavior |
| Complete `npm run test:unit` on Node 22.23.3, after correction | 215 application + 20 tooling tests passed | CI-runtime verification |
| `npm run test:e2e` | 10 passed, no retries | Production web build and mobile browser flows |
| `npm run test:ios` | 2 passed | Rebuilt/synchronized app, actual native plugin, iPhone 18 Pro / iOS 27.0 |
| `git diff --check` | Passed | Local corrections |

Typecheck and lint were rerun after the test correction. Browser and native
checks preceded that test-only correction; application runtime code was not
changed during this verification. Native synchronization also verified all
30 locked production audio clips and built the native bundle.

The browser suite exercised the learning/review loop, Skip Ahead, session
navigation, photo fallback, large text, real bundled audio, same/different
reviews, unreadable-progress recovery, failed lesson-save retry, and failed
reset retry. Browser tests exercise Dexie and shared React behavior.

The native smoke exercised background/foreground session recovery and introduced
species persistence across process termination. Local native evidence is in
`.artifacts/ios-smoke/test.json` and `test.xcresult`; browser status is in
`beakspeak/test-results/.last-run.json`. These generated files are gitignored.

Adapter tests cover real SQL, atomic lesson/reset rollback, committed data
preservation, precision and optional timestamps, duplicate confusion events and
ordering, concurrent operation serialization, initialization retry, unsupported
schema rejection, file-backed close/reopen, and commit/rollback/close failures.
Their bridge implementation is a test boundary, not the actual iOS plugin.

## Corrections

PR #65's web CI failed while importing `node:sqlite`. Reproduced with:

```bash
cd beakspeak
npm exec --yes --package=node@22 -- node node_modules/vitest/vitest.mjs run src/adapters/sqliteStorage.test.ts
```

Node 22 provides `DatabaseSync` and identifies `node:sqlite` as a built-in, but
omits it from `builtinModules`. Vitest's client externalization list derives
from that list, so Vite attempts to bundle the static import and rejects it.
The contract test now loads the actual built-in with `createRequire`, retaining
TypeScript types and all existing assertions. No dependency or runtime adapter
change was needed. The same command then passed, followed by the full unit layer
under Node 22. The local fix has not been committed or pushed; the existing
remote CI failure does not verify this correction.

## Standards

Independent read-only review found one narrow recovery limitation. The native
SQLite plugin constructs its implementation once at bridge load and retains a
failed initialization state if directory creation fails. In-app Retry cannot
recreate that implementation, even when directory preparation later succeeds.
The recovery instructions in `docs/native-storage.md` now explicitly require
full quit/relaunch after the underlying filesystem problem resolves for this
specific bootstrap failure. This behavior was established by reading installed
plugin source; it was not fault-injected into the simulator.

No other documented standards violations or serious structural findings were
identified. The final failure-path audit checked transaction rollback, connection
recovery, resource cleanup, dependency APIs, and platform boundaries.

## Spec

Independent read-only review found no unintended scope expansion or concrete
implementation violation. The shared storage/domain contract, platform selection,
atomic operations, fresh-beta transition, and schema protections are implemented.

Issue #32's physical TestFlight acceptance remains incomplete. It still requires
progress **and confusion history** preservation across force quit and an ordinary
SQLite-to-SQLite app update, reset across relaunch, and controlled native failure
recovery. Simulator progress-count assertions and Node SQLite tests cannot prove
these distributed-device behaviors. See `docs/native-storage.md` for the pending
gate and evidence table. Physical signing, silent-switch audio, and VoiceOver
were not tested in this session. Content-pipeline Python tests and deployment
were outside this storage verification; `test:ci` was not run.

Review totals: Standards — one documented recovery limitation, clarified;
Spec — zero implementation findings, one pending physical-device acceptance gate.
