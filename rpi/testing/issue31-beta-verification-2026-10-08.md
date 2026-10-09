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
| Apple processing/compliance | Complete | Owner confirmed None of the listed non-OS algorithms; Apple cleared the build for group assignment |
| Beta description, feedback contact, What to Test | Saved and verified | Scope and disposable earlier browser-storage/no-migration wording |
| Internal group | One tester / one build, Testing | `2.0.0 (1)` assigned; owner status Invited |
| Partner invitation | Sent by owner | Marketing; app-access editing disabled until acceptance, with All Apps displayed for the pending invitation |
| Future build declaration | Passed red/green configuration test and native smoke | Source Info.plist now declares `ITSAppUsesNonExemptEncryption=false` for the reviewed implementation |

Local Node was v26.11.0. Typecheck, lint, the complete unit suite, and native smoke
were rerun after the owner-confirmed Info.plist change. The existing configuration
test first failed for the missing declaration, then passed after adding it.
Browser E2E was not rerun locally: no learner behavior changed, and the GitHub web
job already exercised that suite. `test:ci` was not run. No new learner code or
test seam was introduced.

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
or unjustified scope expansion. The review identified the following acceptance
areas; the owner's subsequent partner-waiting deferral is recorded below:

1. The owner confirmed legal-name seller acceptance on 2026-10-09. Individual
   enrollment means the membership is in the owner's personal name rather than
   an organization; that account type has not been independently verified here.
2. Privacy text still needs owner review before treating that declaration gate
   as complete. The owner confirmed the audited export answer; the compliance
   hold and group-assignment gate are now resolved.
3. The owner sent the Marketing invitation. After acceptance, verify/narrow app
   scope to BeakSpeak: the pending-user list shows All Apps, and its Edit App
   Access action is disabled. BeakSpeak is the only current app. Partner group
   membership and the expert's same-build TestFlight installation are deferred
   follow-up by the owner's explicit 2026-10-08 instruction. The invitation stage
   is done for the first-beta scope; the owner's own installation remains pending.
4. Actual sessions/device details, crash-view access, and received screenshot
   feedback need installed-beta evidence. No third-party diagnostics SDK was added.

The initial portal-text concern was resolved during this implementation: the
build-specific What to Test was saved and verified. Permanent identity, normal
upload, and the ADR's commitment, device evidence, alternatives, and exit criterion
are supported. Optional Cloud preparation remains available for later use; the
first beta uses the owner-selected local route.

Spec review: **0 implementation defects**. The original review identified
ownership, privacy, collaborator scope, installation, and diagnostics gates.
The owner subsequently deferred partner acceptance/scope/installation; the
remaining first-beta checks are ownership/privacy confirmation, owner installation,
and diagnostics/feedback evidence.

## Completion boundary

Keep #31 open until the remaining first-beta human/account gates have evidence.
Record the deferred partner work separately. Do not mark
the app as a release candidate from unit, simulator, archive, or upload checks
alone. The SQLite-to-SQLite TestFlight update and confusion-history inspection
remain the separate #32 acceptance gate. See
[the release checklist](../../docs/testflight-beta.md#human-completion-checklist-for-31)
for the owner and bird expert's exact checks.
