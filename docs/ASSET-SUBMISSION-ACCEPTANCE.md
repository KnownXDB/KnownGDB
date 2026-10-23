# Image submission acceptance

The implementation is local and its new migration is pending on the hosted
database. Do not submit from the normal hosted-connected local environment before
reviewing and explicitly authorizing migration and storage writes. Missing runtime
configuration or migration returns an unavailable state; it must not be bypassed.

## Preparation

1. Review ADR [0011](adr/0011-private-image-submissions-and-review.md), the new
   migration and local test evidence. Confirm the existing nine hosted migrations
   and preserved catalog before applying only the new additive migration.
2. Complete the protected branch/PR workflow separately from remote migration.
   Never reset/replay the hosted database. Record the actual applied SQL checksum
   in migration provenance only after successful authorized application.
3. Create distinct bucket-scoped Object Read & Write runtime credentials and put
   them in the ignored local API environment as `R2_UPLOAD_ACCESS_KEY_ID` and
   `R2_UPLOAD_SECRET_ACCESS_KEY`. Keep delivery credentials read-only and operator
   imports separate. Do not paste values in chat, logs, commands or public source.
4. Use the existing local environment, or the documented isolated local stack
   against explicitly selected test storage. Do not start both modes concurrently.
   Starting local UI alone is not permission to write to shared Supabase/R2.

## Authorized real-service checks

Use a maintainer-authorized original with distribution permission and an existing
published canonical game. Do not publish an asset to complete this checklist.

- Sign in, save the public profile and submit a small original as Personal.
  Verify uploader ownership, public-author linkage, private Submitted state,
  checksum, UTC canonical key and source/rights evidence in the database.
- Review the new private original through preview/download. Move it explicitly
  to In review, then Approve or Reject with reasons. Verify actor/reason history
  and continued public denial. A moderator cannot publish.
- Submit another revision to the same collection, with another language or
  season/event when applicable. Verify a new UUID/object key, chronological
  revision and unchanged prior original. Check source and downloaded hashes.
- With Super Admin, verify Official asset and Created by KnownGDB credits on
  separately authorized submissions. Contributor requests for those credits must
  fail, including direct API requests.
- Exercise a retried reserved PUT without duplicate versions. Record interrupted
  reservations for reconciliation; never delete their objects automatically.

Hosted deployment and its private runtime configuration remain explicit later
steps. Reuse the existing testing URL and preserve automatic-build restrictions.
Capture real account acceptance separately from controlled browser tests. Full
hosted recovery, MFA and production abuse hardening are not certified by this flow.
