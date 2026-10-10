# Issue #32 acceptance verification — 2026-10-09

The SQLite implementation is present. Issue #31 is closed and its physical
TestFlight evidence is reused here; those checks need not be repeated.

## Current verification

Verification used the current working tree, including pre-existing learner UI
changes. No runtime code was changed for this verification.

| Check | Result |
|---|---|
| Typecheck | Passed |
| ESLint | Passed |
| Complete unit layer | 230 app tests and 23 tooling tests passed |
| Mobile browser E2E | All 13 tests passed, without retries |
| Actual native plugin and simulator persistence | Previously verified by the two passing XCTest checks recorded in the October 8 storage/beta reports; not rerun today |

The first browser attempt could not bind the preview port inside the sandbox.
The authorized retry passed. Native recovery browser tests cover malformed
records with confirmed erasure, protected newer-schema data, and stalled loads.
Other browser tests cover failed lesson-save/reset retry and the learner journey.

Real SQLite adapter tests verify progress and confusion round trips, atomic
lesson/reset rollback, file-backed close/reopen, failed reads/writes/commits,
connection recovery, serialized operations, and safe schema handling. The web
adapter has equivalent contract and failure coverage. These results establish
implementation behavior, not physical TestFlight update preservation.

## Reused human evidence

[Issue #31](https://github.com/avoidthekitchen/avilingo-v2/issues/31) records
TestFlight `2.0.0 (2)` installed on iPhone 15 / iOS 26.6.2, with owner checks for
lessons/quizzes, Review, Progress, silent-switch audio, lock/background behavior,
and force quit. The owner reaffirmed those checks in this chat on October 9.

The existing #31 record does not identify saved records before and after an
ordinary SQLite-to-SQLite update, confusion-table contents, reset across relaunch,
or a controlled native storage failure. The owner subsequently confirmed that
build 1 was updated to build 2 without deleting the app, saved progress remained,
and reset stayed empty after force-quit/relaunch. Count those visible progress
checks as passed. That confirmation does not provide hidden confusion-table data
or evidence of an injected native storage failure.

Device discovery found the owner's iPhone available to the Mac. No application
container or database snapshot was obtained in this session. No app was installed
over TestFlight, and no phone data was reset or modified by this verification.

## Completion boundary

Backend selection/tradeoffs, the shared adapter contract, platform selection,
learner-flow regression coverage, deliberate no-migration behavior, contract
tests, controlled storage-error behavior, and reset have evidence. These eight
issue criteria can be checked; reset combines the owner's visible physical check
with real SQLite tests proving atomic removal of both tables.

The physical gate still needs hidden confusion history evidence across force quit
and an ordinary TestFlight update, physical confusion-table reset evidence, and
controlled native failure/retry. Visible progress update/reset checks are passed.
Keep the corresponding acceptance criteria
open until those checks are demonstrated or the owner explicitly changes scope.
Do not infer hidden confusion history from the Progress screen.


## Owner-approved completion

Later on October 9 the owner explicitly accepted the current evidence for the
initial early release and requested deferring deeper storage checks to a separate
ticket. [Issue #68](https://github.com/avoidthekitchen/avilingo-v2/issues/68) now owns
physical confusion-history preservation/reset inspection and controlled native
failure/retry. Those checks remain unperformed; they no longer block #32 under
the owner's revised scope. No diagnostic controls or database inspection feature
were added. The earlier completion boundary above records the original scope.
