# Image submission acceptance

The implementation is integrated in develop and its additive migration is applied
on the hosted database. Real upload acceptance remains pending. Configure the
separate runtime credentials and use only a maintainer-authorized original for
shared-service checks. Missing configuration returns an unavailable state and
must not be bypassed.

## Preparation

1. Review ADR [0011](adr/0011-private-image-submissions-and-review.md), the new
   migration and local test evidence. The existing nine hosted migrations and
   preserved catalog were verified before
   applying only the new additive migration.
2. Complete the protected branch/PR workflow separately from remote migration.
   Never reset/replay the hosted database. The assigned version and SQL checksums
   are recorded in migration
   provenance following successful authorized application.
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

## Upload size and new games

The frontend, API and database permit originals up to 4 MiB (4,194,304 bytes),
with margin below Netlify's buffered binary request bound. The 16 MiB delivery
limit is unchanged. Hosted uploads still require explicit deployment and
real-service acceptance.

For a new canonical game, use **Add a game** in the admin interface. Supply its
title, language and source reference, then select **Create draft**. The game
appears in administrative image submission choices without being published.
Check the existing list before creating a title; a normalized title/language
match is blocked for manual identity review. Select the new draft and submit
its original artwork, leaving both the game and version private for acceptance.

## Game visibility and publication blockers

The local admin interface includes **Manage games**. Super Admins can explicitly
set Draft, Published or Withdrawn after reviewing the primary title, language and
source and confirming the visibility change. Publishing approves the primary
title through the existing service-only administrative transaction. Updates use
the exact catalog revision, record the actor and status in the game audit, and
reject stale edits. Use **Refresh games** after a conflict. The administrative
catalog currently shows the latest 100 games.

Draft and withdrawn games are hidden from public search and original delivery.
Withdrawal preserves canonical identity, originals, version states and history;
permanent deletion is not exposed. Restoring a game to Published restores access
to its previously published versions. Unpublished versions still require their
own explicit publication action.

For a new game, review and publish the game first, then publish each approved
image with its own reason. The history now identifies individual blockers:
parent game status, asset review, storage verification, rights evidence and
creation time. Game visibility changes refresh both history and upload choices;
withdrawn games cannot be selected for new submissions.

Validation: 56 automated tests, twelve-migration disposable PostgreSQL replay,
and desktop/mobile browser checks with controlled API responses. Browser plugin
not available; Chrome/Playwright was used. These checks do not publish, withdraw
or delete existing shared-service records. Real-account acceptance of the new
game visibility controls remains a separate manual step.
