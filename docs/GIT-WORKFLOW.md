# Git workflow

`develop` is the default branch and integration environment. `main` contains
manually promoted stable integrations. There are no automatic merges, releases,
deployments, previews or database migrations.

## Work cycle

1. Fetch, switch to `develop`, and fast-forward from `origin/develop`.
2. Create a short-lived `feature/`, `fix/`, `chore/`, `docs/`, `refactor/`,
   `test/`, `build/` or `ci/` branch with a descriptive neutral name.
3. Link a real issue in the repository project. Keep scope and acceptance clear.
4. Implement and run applicable local checks. Review the complete staged diff.
5. Run `node scripts/repository-policy.mjs` and
   `node scripts/scan-secrets.mjs` before pushing. Scanning fails closed when the
   pinned scanner cannot be downloaded or verified. It requires network access.
6. Commit with a verified signature. Open a PR targeting `develop`, assigned to
   `@mvuljevas`. PR automation maintains the assignment, including external PRs.
7. Review the exact diff and successful CI; integrate manually. Work branches
   are deleted automatically after merge; protected branches are retained.
8. Test the integrated result on `develop`. Application tests/builds become
   mandatory as application code is introduced; foundation checks alone do not
   establish runtime stability.
9. When stable, open a separate `develop` to `main` PR documenting test evidence.
   Its exact develop commit must have successful integration CI. Promotion is a
   deliberate maintainer decision; deployment still requires separate authorization.

Use merge commits for `develop` to `main` to preserve shared ancestry. Squash may
be used for work branches. Never delete `develop` after promotion. Synchronize
`main` back into `develop` through a `chore/` PR when necessary before the next
promotion; do not bypass branch protection or force-push to resolve divergence.

## Protection and review

Both long-lived branches require PRs, signed commits, resolved conversations,
up-to-date branches and the `repository-policy`, `secret-scan` and `branch-policy`
checks. Force push and deletion are disabled, including for administrators.
Merge commits are allowed; rebase merging is disabled.

Only one maintainer currently has write access. No self-approval is represented
as independent review: CI plus a documented manual maintainer review is required.
An independent approval becomes mandatory when a second maintainer is available.
CODEOWNERS identifies responsibility without creating an impossible approval gate.

## Local safeguards

Enable versioned hooks for this checkout only:

```sh
git config --local core.hooksPath .githooks
```

Pre-commit checks the staged snapshot; pre-push scans history and the working
directory and rejects direct pushes to protected branches. Hooks supplement
server protection and review; they can be bypassed and do not prove absence of
all secrets. Do not disable signing, suppress scanner findings or commit private
reports. Rotate any exposed credential before investigating history cleanup.

The policy blocks generated output, private configuration, media and binary
artifacts from the tracked source. Review intentional small textual fixtures.
No dependency tree or build output belongs in Git. Examples contain empty values.

## Tracking

[KnownGDB project](https://github.com/orgs/KnownXDB/projects/1) is linked to this
repository. Add real issues and PRs to it, keep status accurate, and link acceptance
evidence. Historical draft cards are planning, not implemented capabilities.
Project association does not by itself enable automatic item ingestion. Native
auto-add can be configured in the project's workflows without adding access
tokens to repository Actions; no organization-project token is stored here.

## Foundation snapshot

`foundations` is identical to the initial commit `97949fc`; it has no unique work.
It is retained as a reference and is not an integration or feature branch.
