# ADR 0012: Reviewed, normalized game metadata revisions

Status: implemented locally; remote migration applied, real-account acceptance pending.

## Context

Quick game intake lacks complete catalog editing. Games can have several
developers/publishers and releases with different platforms, dates, regions and
language capabilities. Replacing a published title directly would expose pending
edits and destroy the previous account of those facts.

## Decision

Store complete metadata revisions with normalized localization, alias, release,
organization-credit, language-support and classification relations. Typed catalog
terms give organizations, platforms, genres, themes, perspectives and modes stable
UUIDs. Creation is explicit; duplicate normalized names require manual review.
Existing game UUIDs and asset collections/versions remain independent.

Each save appends a pending revision, under a game row lock and an expected latest
revision ID. No direct service-role inserts, updates or deletes are granted on
these eight new tables. Narrow service-only functions run with fixed search paths
and recheck active administrator/session membership. RLS remains enabled; browser
roles cannot call these functions or access the tables.

Super Admin approval checks the latest saved revision, records a reviewer/time and
reason, and updates the searchable localized title/description transactionally.
The approval audit retains the previous localization rows, including legacy
metadata that predates the revision model.
Removed translations remain preserved in historical revisions and legacy rows but
are removed from reviewed current search. Approval does not publish the game or
change asset publication states. A pending replacement never changes the public
projection of the latest approved revision. Game Draft/Withdrawn hides metadata
even when a revision has been approved.

Dates are partial strings validated against real calendar dates: empty for
unknown, YYYY, YYYY-MM or YYYY-MM-DD. Announced and actual dates are separate;
no fabricated date is persisted for a known year. Language capabilities use
nullable booleans: unknown differs from supported and not supported. Credit and
language rows may apply to the whole game or a release within the same revision.
Release removal explicitly removes its scoped rows from the pending edit.

The revision source, confidence and capture timestamp apply to all its facts in
this first slice. The source field can hold multiple scoped references. Dedicated
per-fact conflicting-source resolution, credit validity ranges, quarters/windows,
franchise relationships, accessibility and advanced technical information remain
outside this slice; see the [metadata inventory](../GAME-METADATA.md).

## API and editor

- `GET/POST /api/v1/admin/metadata-terms`: list/select or explicitly create terms.
- `GET /api/v1/admin/games/:id/metadata`: latest revision and preserved baseline.
- `POST /api/v1/admin/games/:id/metadata`: save a complete pending revision.
- `POST /api/v1/admin/games/:id/metadata/approval`: approve the saved revision.
- `GET /api/v1/games/:id/metadata`: approved public fields and referenced term
  names, without actor identities, source evidence, confidence or change reasons.

The editor is opened by **Manage games → Edit metadata**. Keep draft intake short.
Load existing localizations when creating the first revision rather than dropping
translations. Show an explicit revision and review state. Unsaved changes disable
approval; successful saves reload the stored representation. The public game
expansion displays approved descriptions, credits, releases, language support and
classification beside its existing asset-version history.

Only metadata save requests receive a 128 KiB streamed JSON bound, including the
local Node adapter. Other JSON request limits remain 4 KiB and image upload limits
remain 4 MiB. UI and API enforce bounded rows and field lengths; database foreign
keys enforce game/release and typed vocabulary relationships. External URLs are
stored as references, never fetched automatically.

## Activation and validation

The explicitly authorized migration `20261023183727_game_metadata.sql` is applied
remotely and recorded with source/remote SQL checksums in the applied ledger.
The disposable replay
includes thirteen migrations and checks all 22 catalog tables have RLS enabled.
Activation inserts no game/asset rows and changes no existing catalog contents.
Activation on 2026-10-23 preserved all eight verified tables: 3 games,
3 localizations, 6 legacy assets, 12 collections, 12 versions, 36 version events,
6 submission intents and 23 game audit events. Complete-row fingerprints matched
before/after, including original storage references and publication states.
All 22 catalog tables have RLS enabled. Anonymous writes, browser approval and
direct service-role localization rewrites remain denied. No R2 operation was
performed. Do not reset or replay the hosted baseline.

Automated coverage checks date precision, duplicate/scoped references, nullable
language support, stale edits, membership/session enforcement, independent
approval, pending/public isolation, audit and request bounds. Browser acceptance
uses controlled API responses and must be reported separately from real-service
acceptance. No real game publication or account impersonation is a test shortcut.

## Consequences

Revisions preserve corrections without copying R2 objects. Normalized records
support future filtering while the API assembles a versioned document for editing.
Full-document saves are simpler initially but bounded to 128 KiB; pagination and
incremental editing require a separate design if real catalogs exceed that bound.
Vocabulary rename/merge tooling and a browser for historical metadata revisions
remain future work. Historical revisions are retained in the database and audit;
the initial editor displays the latest revision only.
