# ADR 0004: immutable asset history and publication identities

Date: 2026-10-19. Status: accepted by maintainer request.

Each canonical Game UUID owns many asset collections and chronological immutable
versions. A collection groups a role, provenance and public credit identity;
versions carry languages, context, validity, technical metadata and unique R2 keys.
Official seasonal and event artwork is additional history, never a renamed game
or an overwritten original. Global is language-neutral; multi-language files use
one canonical object and retain their explicit language tags in the database.

New keys use `games/{game UUID}/{official|community}/{role}/{language scope}/`
followed by UTC `YYYY/MM/{version UUID}/original.{extension}`. Database foreign
keys bind collection, version and game; insertion computes the key and serializes
per-collection revision numbers. Creation time organizes storage; validity time
selects presentation. Preserve the original upload time separately from event dates.

An external source disappearing never deletes preserved history. An expired event
falls back deterministically to eligible base content in the requested language
or Global; unpublished, unreviewed or unlicensed content is never a fallback.

Uploader, provenance and public credit are distinct. All uploaders are registered
Auth users. Personal credit requires a registered contributor profile owned by
the uploader. Only an active Super Admin can choose Official asset or Created by
KnownGDB. Neither selection invents a personal author or erases uploader identity.
Rights and original/derivative classification remain separate moderation concerns.

The explicitly designated existing administrator receives the Super Admin role
only after a transactional guard verifies the sole user and active membership
match. Existing asset rows and R2 objects are not relabeled or moved; reconciliation
and authenticated ingestion are subsequent work. No user account is created.

The initial screens are executable development workspaces, not the finished
premium catalog or a completed authenticated publishing UI. Domain policy and
schema enforcement precede upload enablement. The new migration extends the
recovered existing catalog; it is not a replacement baseline for an empty database.
