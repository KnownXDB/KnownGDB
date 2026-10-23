# ADR 0011: Private image submissions and explicit review

Status: implemented and tested locally; hosted migration and acceptance pending.

Tracking: [issue 39](https://github.com/KnownXDB/KnownGDB/issues/39).

## Decision

Use the existing canonical game, collection, version and append-only event model.
Add a private submission reservation before storing any new original. A confirmed
account, active Auth session and saved contributor profile are required. The API
derives the actor from verified identity. Only an active Super Admin may choose
Official asset or Created by KnownGDB credit; other submissions use Personal
credit linked to the registered contributor. Collection identity remains immutable.

Reservations receive a server-generated UUID, UTC timestamp and canonical R2 key.
Language, season/event and validity belong to the new version. New revisions may
target only the uploader's existing collection with matching game, role and credit.
The database serializes revision assignment and enforces ownership again on insert.

The first transport accepts PNG, JPEG and client ICO images up to 2 MiB. Metadata
uses the existing 4 KiB JSON limit; the original uses a separate bounded PUT body.
The lower upload limit accommodates hosted request buffering without changing the
existing 16 MiB original-delivery limit. Video/preserved trailers and larger-file
transport remain planned; their existing roles/extensions are preserved.

Validate metadata, file framing, dimensions, exact byte size and SHA-256 before
storage. Structural checks are not full codec validation or malware certification.
Reviewers must inspect visual integrity, provenance and distribution permission.
Reject SVG, mismatched MIME/extension, malformed framing and excessive dimensions.

Use separate server-only `R2_UPLOAD_ACCESS_KEY_ID` and
`R2_UPLOAD_SECRET_ACCESS_KEY` credentials scoped to the bucket. Never reuse
read-only delivery or operator import credentials. The API performs conditional
create-only writes followed by a bounded full read and independent hash check.
No overwrite, delete, client-supplied object key or direct public bucket access is
provided. R2's bucket permission still technically permits writes/deletes outside
this API; protect the credential independently of the application safeguards.

After verification, one database transaction inserts the collection if necessary,
the private submitted version and its audit event, then completes the reservation.
The reservation UUID is also the version UUID. Concurrent/repeated completion is
idempotent. A conflicting existing object must match the reserved original before
completion; it is never replaced.

Reservation identity and metadata are immutable. Completed reservations cannot be
reassigned. A failed database commit retains a private object mapped to its
reservation for recovery. Pending reservations expire after one hour; no automatic
deletion occurs. Twenty reservations per account per rolling day bound this slice.
Manual reconciliation of expired reservations is operational follow-up, not
permission to remove original evidence. Retry in the same open form retains the
reservation and original; closing/reloading the page loses that in-memory retry.
The account's latest 100 collections are offered for revision selection.

Moderators and Super Admins may move a private version from Submitted to In review,
then Approved or Rejected, with an explicit reason and expected-state check.
Approval requires verified storage and never publishes the version. Existing
Super Admin publication remains a separate operation. Reviews append actor/reason
events; stale or published versions reject review changes.

## Database and service boundaries

Migration `20261022010000_asset_submissions.sql` is additive and pending remotely.
It adds one RLS-enabled service-only table and restricted transactions. Browser
roles cannot execute the reservation, completion or review functions. The small
session-check function uses a fixed search path and restricted definer access to
Auth tables, avoiding additional Auth table grants to the service caller. Other
transactions use invoker security. See [Supabase function security](https://supabase.com/docs/guides/database/functions)
and [R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/).

No remote migration, hosted write, deployment or asset publication is part of local
implementation. Existing hosted browsing/delivery remains on the accepted build.
Use the [acceptance runbook](../ASSET-SUBMISSION-ACCEPTANCE.md) before real writes.

## Local evidence and limits

API tests exercise identity, CSRF, metadata, ownership filtering, media bounds,
create-only HTTP writes, read-back integrity, retries and moderation dispatch.
Disposable PostgreSQL replays ten migrations and verifies contributor credit,
active sessions, ownership, immutable reservations, revisions, quotas, expiry,
idempotent completion, audit events, stale transitions and denied browser roles.
Auth tables in that runner are a contract fixture, not a full Auth installation.

Chrome/Playwright at desktop and mobile sizes verifies the submission form,
restricted credit options, failed-upload retry without a second reservation and
explicit review/approval without publication. Browser API responses are controlled;
these checks are not real hosted submission acceptance. Browser plugin access was
unavailable. No production security certification is claimed; MFA, full codec
processing, broader abuse controls and video remain separate work.
