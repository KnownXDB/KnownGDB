# ADR 0021: PlayStation Store official page connector

Status: accepted; local preview and explicit reviewed persistence implemented.

## Context

PlayStation Store exposes localized concept pages and product pages. A concept
can group editions and related products, while a Product ID identifies one
regional storefront product. These are different scopes and must not be merged
automatically into one external identity or replace the immutable KnownGDB
catalog item UUID.

## Decision

The connector accepts either:

- a numeric Concept ID and a URL of the form
  `https://store.playstation.com/{locale}/concept/{id}`; or
- a Product ID and a URL of the form
  `https://store.playstation.com/{locale}/product/{id}`.

The server constructs the official localized URL, fetches it with a timeout and
parses available page metadata into a temporary `PlayStationStorePreview`:

- page kind and identifier;
- locale and official Store URL;
- title, description, image and release date when exposed;
- capture timestamp and official Store source kind.

The preview endpoint requires an authenticated active administrator session and
does not mutate the catalog. A separate Super Admin confirmation refetches the
official page on the server, validates the KnownGDB catalog UUID and review
reason, then persists an idempotent listing and either a `concept_id` or
`product_id` identity through an audited database function.

The connector does not harvest every edition Product ID displayed by a Concept
page. Each edition, DLC, bundle or product must receive its own reviewed
observation and, where appropriate, a reviewed catalog relation.

## Consequences

- Concept and Product IDs remain independently addressable in
  `catalog.external_identities`.
- Locale is part of the storefront evidence and normalized into the catalog's
  region/locale fields.
- Voucher and discount codes are account or transaction values, not catalog
  identity.
- Regional availability and page structure can change; observations retain a
  capture timestamp and incomplete metadata is not silently promoted to catalog
  facts.

## Verification

Parser tests cover concept/product identity scope, localized URL construction and
malformed identifier rejection. Database replay tests cover both page kinds,
verified persistence, idempotent updates and untrusted source rejection. The
admin surface labels observations as not persisted until explicit Super Admin
confirmation.
