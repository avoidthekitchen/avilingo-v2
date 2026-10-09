# Issue #31 — internal beta implementation verification

Date: 2026-10-08. Branch: `codex/xcode-cloud-testflight`.
Review baseline selected by the owner: `564ace5f937c1ce793268ada72d4b3af8f7a9e4f`.
The initial two-axis review inspected HEAD `c1ea370`; subsequent changes record
verified portal text, cryptographic-audit facts, and this verification report.

## Validation

| Check | Result | Scope |
|---|---|---|
| Typecheck | Passed | Application TypeScript |
| ESLint | Passed | Application and root tooling |
| Full unit suite | 230 application + 23 tooling tests passed | Existing unit layer, including the Cloud hook |
| `npm run test:ios` | Two passed | Native packaging, foreground recovery, force-quit persistence; iPhone 18 Pro / iOS 27.0 |
| Native production archive | Passed | `2.0.0 (1)`, permanent bundle ID, all 30 audio clips, four dependency privacy manifests |
| Apple validation | Passed | Organizer reported all validation checks passed |
| Normal App Store Connect upload | Complete | Preserves eligibility for later external/App Store distribution |
| Apple processing | Complete, Missing Compliance | Build `42ee5d0e-acf9-4331-8221-9dd5a5c2e69e`; owner declaration pending |
| Beta description, feedback contact, What to Test | Saved and verified | Scope and disposable earlier browser-storage/no-migration wording |
| Internal group | Created, owner added | Manual build assignment; actual assignment is blocked by compliance |

Local Node was v26.11.0. Browser E2E was not rerun locally: this continuation
changed documentation and account metadata, and the GitHub web job already
exercised the production browser suite. `test:ci` was not run. No new runtime
learner code or test seam was introduced during this continuation.

Ignored evidence includes `.artifacts/testflight/archive-audit.json`,
`crypto-audit.json`, `local-upload-complete.jpg`, `encryption-question.jpg`, and
`armand-invitation-scope.jpg`; native smoke results are under
`.artifacts/ios-smoke/`. Private invitation/contact data remains in the release
chat and ignored screenshots, not in this public verification record.

## Standards

Independent read-only review found no documented-standard violations or
actionable baseline smells in the eight changed files. The Cloud hook uses
locked dependencies, production audio reconstruction, and existing native sync;
generated packaged assets remain unedited. Documentation distinguishes native
simulator evidence from physical TestFlight acceptance and retains #32's
separate storage-update gate. The small hook tests share their fixture and
exercise failure handling at the command boundary.

Standards findings: **0**.

## Spec

Independent read-only review found no confirmed code gap, wrong implementation,
or unjustified scope expansion. Four acceptance groups remain partial:

1. Individual-account enrollment type and legal-name seller acceptance need
   owner confirmation.
2. The audited export-compliance answer and privacy text need owner review;
   the actual build is Missing Compliance until its questionnaire is submitted.
3. The app-only Marketing invitation needs final confirmation/sending and
   acceptance, followed by build assignment and both same-build TestFlight
   installations.
4. Actual sessions/device details, crash-view access, and received screenshot
   feedback need installed-beta evidence. No third-party diagnostics SDK was added.

The initial portal-text concern was resolved during this implementation: the
build-specific What to Test was saved and verified. Permanent identity, normal
upload, and the ADR's commitment, device evidence, alternatives, and exit criterion
are supported. Optional Cloud preparation remains available for later use; the
first beta uses the owner-selected local route.

Spec review: **0 implementation defects; 4 partial human/account gates**.

## Completion boundary

Keep #31 open until the remaining human/account gates have evidence. Do not mark
the app as a release candidate from unit, simulator, archive, or upload checks
alone. The SQLite-to-SQLite TestFlight update and confusion-history inspection
remain the separate #32 acceptance gate. See
[the release checklist](../../docs/testflight-beta.md#human-completion-checklist-for-31)
for the owner and bird expert's exact checks.
