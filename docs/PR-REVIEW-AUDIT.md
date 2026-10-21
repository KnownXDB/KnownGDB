# PR review and repository audit

Date: 2026-10-20. Scope: all 28 pull requests available at review time, including
closed and merged requests, and the current application foundations in PR 36.

## Review coverage

The complete paginated review query returned two general comments, zero reviews
and zero review threads. The comments were an informational dependency-bot
acknowledgement on closed PR 16 and an obsolete automated-review status on PR 1.
Neither contained an actionable code finding. PR 36 had no review comments or
unresolved discussions. The changes below come from repository analysis rather
than attributed reviewer requests.

## Resolved findings

- Account and publication requests now enforce their byte limit while reading
  streamed input, validate JSON framing and stop consuming oversized bodies.
- Session probes cannot overwrite a later sign-in or sign-out operation with
  an outdated response. Recovery fragments also clear refresh-only tokens.
- Local API client disconnects propagate cancellation to pending storage reads.
- Both development frontends deny private environment, operational and session
  files independently of Git ignore rules while preserving normal source access.
- Optional isolated local development removes inherited hosted storage and
  account credentials before launching its services.

## Evidence and boundaries

Formatting, types, 47 tests, nine migrations on disposable PostgreSQL and the
web/admin/API builds passed. Regression tests exercise actual HTTP streaming,
client cancellation and both frontend filesystem boundaries. The isolated
launcher test intercepts child creation; it does not start another environment.

Chrome/Playwright checks confirmed the delayed-session/sign-out regression and
recovery-fragment cleanup. Private preview, byte-exact download, authorization
feedback and moderator controls passed at desktop and mobile sizes with
controlled administrative responses; real public catalog reads were checked
separately. Browser plugin access was unavailable. The maintainer's earlier real
account acceptance remains distinct from these controlled browser checks.

The dependency audit reported zero known vulnerabilities. Repository policy and
redacted source/history scanning complement review; they do not guarantee that
every possible secret or security defect is detected. No hosted migration,
storage write, asset publication, merge or deployment is part of this audit.

Next step: review the exact PR 36 diff and its successful required checks before
making an explicit integration decision.
