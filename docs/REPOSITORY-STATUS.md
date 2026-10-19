# Repository governance validation

Date: 2026-10-19. Scope: repository foundations and Git workflow, not application
runtime, hosted infrastructure, deployment or a stable product release.

## Evidence

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
- [Issue 13](https://github.com/KnownXDB/KnownGDB/issues/13) and its PR are attached
  to the existing linked [project](https://github.com/orgs/KnownXDB/projects/1).
- `foundations` and original main share the root commit with no unique differences.
  The snapshot is retained; no extra implementation was discovered there.

## Limits

Application checks will be added with the workspace. Project linkage does not
enable native auto-add; item ingestion is currently explicit. No additional
organization token has been created for project automation.

Assignment automation is metadata-only, does not execute PR code, and becomes
available on a base branch after that workflow is integrated there. The first
main promotion needs explicit assignment because main retains the initial
foundation snapshot until a deliberate stable promotion.

No automatic merge, release, deployment, preview publication, or remote database
operation is configured. Main has not received the governance changes yet.
