# ADR 0002: protected integration workflow

Date: 2026-10-19. Status: accepted by maintainer request.

## Context

The repository is public. Source hygiene and secret prevention must precede
publication. Work needs an integration branch, stable promotion, ownership and
issue tracking without automatic deployment.

## Decision

- Default branch `develop`; short-lived work branches merge into it through PRs.
- `main` accepts only same-repository `develop` promotion PRs, with successful CI
  for the exact develop commit and manually recorded integration evidence.
- Signed commits, required CI, resolved conversations and up-to-date PRs; no
  direct push, force push, deletion or administrator bypass on long-lived branches.
- Allow merge commits for promotions so ancestry is preserved. This supersedes
  the initial linear-history setting; squash remains available for work branches.
- Assign PRs/issues to `@mvuljevas`, reuse the existing linked project, delete
  merged work branches, and retain protected integration/stable branches.
- Local hooks plus CI check source hygiene and run a checksum-pinned secret
  scanner with redacted diagnostics. CI has no deployment credentials.
- The privileged metadata workflow does not check out or execute PR code and
  uses event-file values as data, not interpolated shell commands.
- Minimal read-only default Actions permissions; only the assignment job can
  modify issue/PR metadata. Actions cannot create or approve PRs automatically.
- A sole maintainer documents manual review; require independent approval once
  another authorized maintainer is available. Never simulate self-approval.

## Consequences

Checks block unsafe changes but cannot guarantee discovery of every secret.
Pre-push review and platform push protection remain necessary. The scanner needs
network access and fails closed on download/checksum errors. No scanner binaries,
private reports or diagnostics are tracked. New platform support needs a reviewed
archive checksum. Foundation CI is not a substitute for future application tests.

Bootstrap governance changes integrate into `develop`; they are not automatically
promoted to `main`. PR validation includes branch policy so the first promotion
can be checked before workflows exist on `main`. Metadata assignment becomes
available for PRs targeting `main` after that first deliberate promotion; assign
the bootstrap promotion explicitly. No missing workflow is reported as successful.
