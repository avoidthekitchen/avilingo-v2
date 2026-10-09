# Native progress storage — issue #32

## Decision and scope

The iOS app uses the free MIT-licensed `@capacitor-community/sqlite` 8.1.1 plugin.
The web demo continues using Dexie/IndexedDB. `createStorage()` selects the adapter
using Capacitor's native-platform detection; the learning domain and Zustand store
continue using `StorageAdapter` and the existing domain types.

SQLite supports the small set of per-species progress records, the growing
append-only confusion history, and atomic lesson saves and reset. A preferences
API would require rewriting a growing log as a single preference value; a JSON
file would require application-managed atomic replacement and serialization.
SQLite adds an npm dependency and native Swift packages, but provides database
transactions and a storage implementation reusable for eventual Android.
No paid plugin, license, service, ORM, account, or synchronization is added.

Browser SQLite is deferred. The community plugin's browser implementation saves
a WASM database in IndexedDB, so it would add initialization and persistence work
without providing native durability. SQL, migrations, and record conversion live
in `sqliteSchema.ts`, separate from native connection setup, so future reuse does
not require changing the learning domain.

## Persistence and backups

The database name is `beakspeak`. On iOS the plugin appends `SQLite.db`, producing
`Library/Application Support/BeakSpeak/beakspeakSQLite.db` inside the app container.
Keep the permanent bundle identifier `com.unformedideas.beakspeak` and this path
stable across releases. Storage is outside WebKit's origin storage and cache.

`BeakSpeakStoragePlugin.prepare()` creates the directory and includes it in
ordinary device backups. This explicitly reverses the community plugin's default
backup exclusion. The directory uses iOS file protection available after the
first device unlock. Database encryption and biometric access are disabled; no
encryption key is stored or managed by BeakSpeak.

Backup eligibility is not a guarantee of a backup or restore: the user controls
device backup settings. Deleting and reinstalling the app without restoring a
backup starts fresh. This work adds no cloud sync or independent export feature.

The community plugin still links SQLCipher in unencrypted mode, plus ZIPFoundation.
Their open source notices are bundled and available in Credits. During #31, the
shipping `2.0.0 (1)` archive was inspected: SQLCipher uses the CommonCrypto
provider, the plugin's cryptographic helpers use Apple's CryptoKit/CommonCrypto,
and no non-OS algorithm implementation was found in the inspected app. The owner
confirmed **None of the algorithms mentioned above** in Apple's algorithm
questionnaire, and Apple cleared the build for internal-group assignment.
`ITSAppUsesNonExemptEncryption = false` now preserves that reviewed declaration
for this dependency configuration. Re-audit it when cryptographic dependencies or
features change; disabling database encryption alone is not the justification.
See [the beta record](testflight-beta.md) for the audit and owner decision. References:
[plugin dependency notice](https://github.com/capacitor-community/sqlite#installation),
[Apple's declaration guidance](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption).

## Contract, upgrades, and failure behavior

- Progress is keyed by species ID. An overwrite replaces every progress field,
  including clearing optional timestamps. Numeric FSRS values retain precision.
- `saveProgressBatch` commits every species in a lesson/Skip Ahead operation in
  one SQLite transaction. `clearAll` deletes progress and confusion history in
  one transaction. A failure leaves the previous committed records intact.
- Confusion events retain duplicates and insertion order. They are never pruned
  automatically, and generated database IDs remain outside domain types.
- Native operations run serially so writes and reset cannot interleave.
- BeakSpeak owns begin/commit/rollback because the plugin's implicit transaction
  path can leave a failed commit active. If rollback also fails, reads and writes
  stay blocked until the connection can be closed and reopened safely.
- Schema version is stored in `PRAGMA user_version`. Version 1 creates both
  tables in a transaction that also sets the version. Append future migrations;
  retain released migrations and preserve user data. A newer unsupported version
  rejects initialization rather than downgrading or resetting data.
- Adapter initialization and connection/operation failures remain retryable.
  The community plugin prepares its directory once when the native bridge loads;
  if that bootstrap fails, its failed state persists for that bridge. After the
  underlying filesystem problem resolves, fully quit and relaunch the app to
  recreate the plugin; the in-app Retry action cannot recover that specific
  failure. Neither recovery path deletes saved data. A WebView reload closes
  orphan native connections before opening a new one.
- Errors propagate to the existing application recovery UI. An unreadable
  progress store prevents learning writes, while sounds and Credits remain
  available. There is no silent Dexie fallback or destructive automatic recovery.
- The recovery UI distinguishes malformed saved records, newer-schema data,
  transient failures, and slow native loads. Newer-schema data directs the learner
  to update BeakSpeak and offers neither retry nor erase. Generic failures retain
  retry and full quit/relaunch guidance; they do not offer destructive recovery.
- Malformed progress fields in a readable, supported database offer a separate
  **Erase saved progress and start over** action. It requires explicit confirmation
  that all progress and confusion history will be permanently erased. It uses the
  same atomic `clearAll`, retaining schema protection and the ordinary reset guard.
  Only a successful commit clears the error and returns to a clean Guided Path;
  failed erasure leaves saved records and the confirmation available for retry.
  This is not file repair, row skipping, or forced deletion of an unreadable file.
- Native `getAllProgress` has a 15-second deadline covering initialization and
  querying. It rejects to the controlled recovery UI rather than leaving a loader
  indefinitely. A deadline cannot cancel a Capacitor call: the queue stays attached
  to the actual operation and rejects further reads, saves, or reset while it is
  outstanding. A late result does not update the UI. After the operation settles,
  the learner may retry; if it never returns, fully quit/relaunch. Writes retain
  their existing commit semantics and do not receive generic timeouts.

The first SQLite build intentionally ignores feasibility/first-beta Dexie progress
and confusion history and opens a new Guided Path. No beta data is imported.
Include this transition in TestFlight's **What to Test** before installation:

> This build starts fresh with native progress storage. Progress from earlier
> browser-storage beta builds is disposable and will not be transferred. Progress
> created in this build should survive force-quit and subsequent app updates.

## Automated evidence

Adapter tests use real SQLite through a test implementation of the Capacitor
plugin boundary, including a file-backed close/reopen check. They cover SQL and
transaction behavior, but do not substitute for the actual native plugin.
Dexie's tests continue covering the equivalent save/load/log/reset contract and
read/write failures, including recovery of failed progress and confusion list
reads without changing committed records. Platform-selection and native configuration tests verify
the adapter choice, SPM linkage, directory configuration, and backup preparation.

Use the existing unit suite and mobile Playwright suite for the shared learner
journey and failure UI. `npm run test:ios` synchronizes/builds the native app and
runs the narrow XCTest lifecycle and force-quit persistence smoke. Keep learner
flows in Playwright; do not expand XCTest into the full training journey.
The native-storage recovery browser spec injects an external Capacitor bridge to
exercise the production adapter, store, and UI for corrupted records, unsupported
schema versions, and stalled loads. This complements real SQLite contract tests;
it does not exercise the actual iOS plugin or complete the TestFlight gate.

## Physical-device TestFlight gate (pending)

Implementation and simulator tests can proceed while #31's human distribution
steps are in progress. Issue #32 remains open until this gate has recorded evidence.
Neither a browser test nor a direct Xcode install completes the TestFlight gate.

1. After #31 enables distribution, install SQLite TestFlight build A. Confirm the
   deliberate fresh Guided Path and record the device/iOS and version/build.
2. Introduce species with a lesson or Skip Ahead. Complete some reviews, including
   a wrong choice that records a confusion. Record progress and confusion history.
3. Force-quit and relaunch. Confirm the app returns to the lesson list, retains
   the introduced species/review scheduling, and retains confusion history.
4. Install SQLite TestFlight build B as an ordinary update over A, with the same
   bundle ID. Do not uninstall A. Repeat the cold-load and history checks. A
   Dexie-to-SQLite update is not evidence of SQLite-to-SQLite update preservation.
5. Reset progress. Confirm a clean Guided Path and empty progress/confusion tables,
   including after another force-quit. Exercise a recoverable native storage
   failure in a test build and confirm retry does not overwrite committed records.
6. Record build numbers, device/iOS, results, and attached evidence on #32 before
   calling any build a release candidate. If history or failure inspection cannot
   be demonstrated on the distributed build, keep that criterion pending.

Confusion history has no learner-facing viewer. Verify it through the app's
database in an available device-container inspection workflow; preserve that
evidence separately from learner-visible progress screenshots. When inspecting
an active database, include its journal/WAL sidecars or use a consistent SQLite
snapshot. Do not assume that screenshots of the progress count prove history
preservation, or that simulator file inspection proves TestFlight behavior.

Evidence record:

| Check | Device / iOS | Build A → B | Result / evidence |
|---|---|---|---|
| Force-quit progress and confusion history | Pending | Pending | Pending |
| Ordinary SQLite-to-SQLite update | Pending | Pending | Pending |
| Reset clears both tables across relaunch | Pending | Pending | Pending |
| Controlled native failure and retry | Pending | Pending | Pending |
