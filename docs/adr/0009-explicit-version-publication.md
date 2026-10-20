# ADR 0009: Explicit asset version publication

Date: 2026-10-20. Status: implemented; local checks and hosted schema acceptance passed.

## Decision

Expose paginated version metadata through the shared API. Public history requires
a published game, approved and published versions, verified storage and rights
evidence. Return public credit and language/context metadata, never object keys,
uploader identifiers, private rights references or administrative change reasons.
History includes earlier published versions; it does not select the current
seasonal presentation. Binary previews and downloads remain a separate slice.

Administrative history requires verified identity, a confirmed email, current
active membership and an active Auth session. Moderators can read history.
Only Super Admin can publish or make a version private. The server derives the
actor and session from verified authentication; clients cannot supply them.
Existing encrypted cookie transport enforces same-origin writes and hosted HTTPS.

Each publication action requires a reason and the expected publication state.
A service-only transactional function rechecks membership, session, eligibility
and current state under row locks. Publication requires a published game,
approved review evidence, verified storage, rights and a nonfuture creation date.
Concurrent changes return a conflict and require refreshing before retrying.
Existing triggers record actor and reason in immutable audit events. Neither
publishing nor making private changes originals, source timestamps or legacy rows.

Pages use descending creation time and UUID keyset cursors, preserving PostgreSQL
microsecond precision. The page size is bounded to 50. Supporting indexes cover
game-specific and administrative history.

## Validation and limits

Disposable PostgreSQL tests exercise service permissions, invalid and expired
sessions, moderator denial, eligibility, conflicts, audit events and preservation.
API integration tests cover public projection, pagination, verified actor/session,
CSRF and rejected client-controlled fields. Browser checks cover desktop/mobile,
publication, withdrawal, conflicts, pagination and moderator restrictions using
controlled administrative responses. Real public history is read separately.

No real hosted version is published by implementation or automated verification.
Migration `20261020212708` matches the hosted ledger digest. Hosted checks confirm
service-only function execution and six private versions with zero published.
Real administrator browser acceptance remains a maintainer action. Production
administration still requires the MFA and revocation work documented in ADR 0006.
