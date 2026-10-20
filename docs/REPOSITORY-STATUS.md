# Repository validation

## Current audit: 2026-10-20

Scope: current public source, development workflow and executable local
foundations. Tracking: [issue 20](https://github.com/KnownXDB/KnownGDB/issues/20).
This is not production certification or hosted deployment acceptance.

- The canonical remote is `KnownXDB/KnownGDB`; the repository is public and
  `develop` is the default branch. Work integrates through protected PRs.
- Both long-lived branches enforce signed commits, the three required Actions
  checks, resolved conversations and up-to-date branches, without admin bypass,
  force pushes or deletion. Merged work branches are deleted automatically.
- PRs and work items are assigned to the maintainer and attached explicitly to
  the linked project. Labels and current repository copy use English.
- Source/ignore rules cover credentials, environment files, browser session
  exports, infrastructure state, dependencies, builds, editor history and common
  Windows/macOS artifacts. Force-adding common private paths is rejected too.
- Redacted history and candidate-source scans passed without findings. GitHub
  reports zero open secret-scanning alerts and push protection enabled. These
  bounded results cannot guarantee that every sensitive value is detectable.
- The pinned dependency audit reports zero known vulnerabilities. Formatting,
  types, 18 tests and independent production builds pass. No private database or
  session key appears in the browser production bundles.
- Local browser acceptance covers real published-game search and controlled
  account/recovery flows, including encrypted HttpOnly cookies, reload, renewal,
  negative authorization and sign-out. Controlled Auth tests are not presented
  as real-user cloud sign-ins. The maintainer separately confirmed real recovery,
  Super Admin access and persistence.
- The audit corrected extension/role validation to agree with existing database
  constraints, and preserves cookies when upstream identity verification is
  temporarily unavailable rather than treating outages as invalid credentials.
- CI remains verification-only. No deployment, release, additional migration,
  R2 object change or remote Auth configuration change accompanies integration.

The current roadmap distinguishes completed foundations/backfill and version
publication/metadata reads from pending authenticated ingestion/moderation and
premium product interfaces. Hosted runtime validation, MFA and stronger revocation
controls remain prerequisites for production administration. See
[session boundaries](adr/0006-persistent-account-sessions.md).

Baseline follow-up: six original migrations were recovered read-only and their
digests verified. All seven replay on disposable PostgreSQL with role/guard tests.
The full local Supabase stack also passed real browser account flows on PostgreSQL
17.11, including captured confirmation/recovery mail and server-enforced roles.
Synthetic accounts were removed without accessing hosted Auth data. See
[ADR 0007](adr/0007-recovered-local-database-baseline.md) for the local adaptation.

Storage follow-up: [read-only reconciliation](STORAGE-RECONCILIATION.md) verified
six registered R2 originals and one expired incomplete upload against independent
body hashes. All seven are preserved; no hosted rows or objects were changed.

Import follow-up: the guarded executor and eighth migration are verified locally
with thirteen RLS tables, rollback/permission checks and immutable mapping records.
Authorized hosted execution also passed independent acceptance: six private
versions/mappings and six copies, with all seven original objects and legacy
assets/upload intents unchanged. The eighth migration's digest matches its
ledger entry. See the [runbook](LEGACY-IMPORT-RUNBOOK.md) for evidence and limits.

Publication follow-up: metadata history and explicit Super Admin publication and
withdrawal pass 30 repository/API/domain tests, nine-migration SQL replay and both
frontend builds. The hosted ninth migration matches its source digest; browser
roles cannot execute its function, and six versions remain private. Desktop and
mobile browser checks use controlled administrative responses; the real public
history is empty as expected. No real hosted publication or binary delivery was
tested. See [ADR 0009](adr/0009-explicit-version-publication.md).

Promotion acceptance requires successful CI and local checks on the exact
integrated develop commit, then a separate reviewed develop-to-main PR. Public
PRs and CI runs retain the final integration evidence; no self-review is described
as independent maintainer approval.

## Historical governance snapshot

The following records the state before executable application integration. Its
implementation/main status statements apply to 2026-10-19 only.

Date: 2026-10-19. Scope: repository foundations and Git workflow, not application
runtime, hosted infrastructure, deployment or a stable product release.

### Evidence

- Local root: `KnownXDB/KnownGDB`; origin is the canonical repository.
- `develop` is the default branch. Work changes target develop through PRs.
- `main` and develop require signed commits, required checks and resolved
  conversations; administrator bypass, direct pushes, deletion and force push
  are blocked. Independent approval is not simulated for the sole maintainer.
- [Bootstrap PR 14](https://github.com/KnownXDB/KnownGDB/pull/14) passed
  repository-policy, secret-scan and branch-policy before manual integration.
- The checks originate from the GitHub Actions app required by branch protection.
- Local source-policy tests and workflow lint passed; staged pre-commit and full
  pre-push scanning executed successfully. Scanner archives use verified checksums.
- Platform secret scanning and push protection are enabled; the initial alert
  query was empty. This is a bounded scan result, not proof that leaks are impossible.
- The merged bootstrap work branch was deleted automatically by repository policy.
- [Verification PR 15](https://github.com/KnownXDB/KnownGDB/pull/15) was created
  without an assignee; the assignment workflow succeeded and assigned `mvuljevas`.
- [Issue 13](https://github.com/KnownXDB/KnownGDB/issues/13) and its PR are attached
  to the existing linked [project](https://github.com/orgs/KnownXDB/projects/1).
- `foundations` and original main share the root commit with no unique differences.
  The snapshot is retained; no extra implementation was discovered there.

### Limits

Application checks will be added with the workspace. Project linkage does not
enable native auto-add; item ingestion is currently explicit. No additional
organization token has been created for project automation.

Assignment automation is metadata-only, does not execute PR code, and becomes
available on a base branch after that workflow is integrated there. The first
main promotion needs explicit assignment because main retains the initial
foundation snapshot until a deliberate stable promotion.

No automatic merge, release, deployment, preview publication, or remote database
operation is configured. Main has not received the governance changes yet.
Scheduled dependency-update PR creation is disabled; pinned tools and actions
are updated through explicit work requests.
