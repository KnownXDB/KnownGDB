# ADR 0018: Epic Games Store official page connector

Status: accepted; local preview and explicit reviewed persistence implemented.

## Context

Epic Games Store products expose more than one provider identifier. The public
product home page is addressed by a localized product URL slug, while Epic's
catalog and offer systems use separate namespace, catalog item and offer
identifiers. These values describe different scopes and must not replace the
immutable KnownGDB catalog UUID.

## Decision

The connector accepts an Epic Games Store product slug and a bounded locale. The
server constructs the official URL on `store.epicgames.com`, fetches it with a
timeout, and parses available structured page data into a temporary
`EpicStorePreview` observation:

- localized official Store URL and product slug;
- title, description, image and release date when exposed;
- namespace, catalog item and offer IDs when exposed by official structured data;
- capture timestamp and official page source kind.

The preview endpoint requires an authenticated active administrator session and
does not mutate the catalog. A separate Super Admin confirmation refetches the
official page on the server, validates the KnownGDB catalog UUID and review
reason, then persists an idempotent Epic listing and each observed provider
identity through an audited database function.

Missing structured IDs remain missing evidence. The connector does not infer an
offer ID from a slug, or merge an offer, edition, demo or DLC with its base game.

## Consequences

- The browser never supplies provider credentials or arbitrary fetch URLs.
- Epic slug, namespace, catalog item ID and offer ID remain independently
  addressable in `catalog.external_identities`.
- Store pages can change their rendered structure; previews therefore retain a
  capture timestamp and incomplete observations are not silently promoted to
  general catalog metadata.
- Partner-authenticated Epic operations and catalog discovery remain separate
  capabilities from this public-page connector.

## Verification

Parser tests cover metadata extraction, identity extraction, localized official
URL construction and malformed identifier rejection. Database replay tests cover
verified persistence, idempotent updates and untrusted source rejection. The
admin surface labels observations as not persisted until explicit Super Admin
confirmation.
