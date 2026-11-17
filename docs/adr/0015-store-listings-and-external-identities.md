# ADR 0015: Store listings and external identities

Status: accepted; additive local migration implemented, remote migration pending explicit authorization.

## Context

KnownGDB needs to record official storefront pages and provider identifiers for
the base game, demos, playtests, DLCs, editions and other catalog items. These
identifiers have different namespaces and scopes. A Steam App ID, an Epic offer,
an Xbox Title ID and a Microsoft Store Product ID must not be placed in one
undifferentiated field or treated as the KnownGDB identity.

Some providers expose official APIs or partner portals; others expose only
official pages or identifiers in an authorized publisher workflow. The schema
must support both without pretending that every provider has a public catalog
API.

## Decision

`catalog.store_listings` records a storefront page attached to exactly one
KnownGDB catalog item. A listing carries its provider, URL, role, region, locale,
availability, evidence source, confidence and verification timestamps.

`catalog.external_identities` records a provider identifier attached to exactly
one KnownGDB catalog item and optionally to a store listing. Each identity keeps:

- provider;
- namespace;
- identifier kind;
- original value and matching normalization;
- scope such as catalog item, store listing, offer, SKU or title;
- region and locale;
- evidence source and review state;
- confidence and validity interval.

The original identifier value is preserved. Lowercase trimming is used only by
`normalized_value` for matching and duplicate detection. IDs are unique within
their KnownGDB item, provider, namespace, kind, region and locale. This prevents
accidental duplicates without pretending that unresolved cross-item conflicts
have been editorially solved.

Evidence status is explicit: observed, in review, verified, rejected, stale or
conflicted. A verified record requires a verification timestamp. A source URL
is evidence, not permission to redistribute third-party media or to bypass a
provider's terms.

## Consequences

- A demo or DLC can have a different store listing and identifier from its base
  game while remaining related through `game_relations`.
- Store IDs remain queryable without becoming canonical game IDs.
- Regional and localized listings are represented independently.
- Provider namespaces can grow without a migration for every new identifier.
- Future connectors can populate the same tables from an official API, partner
  export, official page or manual review.
- A later evidence-observation layer can deduplicate repeated captures without
  changing the identity tables.

## Verification and rollout

The migration is replay-tested locally with a verified Steam listing and App ID,
normalization, duplicate rejection, missing listing-scope rejection and HTTPS
validation. No provider credentials, remote migration or automated scraping are
introduced by this change.
