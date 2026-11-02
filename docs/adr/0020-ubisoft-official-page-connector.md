# ADR 0020: Ubisoft Store official page connector

Status: accepted; local preview and explicit reviewed persistence implemented.

## Context

Ubisoft publishes regional product pages under `store.ubisoft.com`. A product
page can represent a base game, edition, DLC, season pass or another purchasable
product, so the Store slug is evidence for a specific listing and does not
replace the immutable KnownGDB catalog item UUID.

Ubisoft's public support documentation describes activation keys and codes as
values linked to a Ubisoft account. They are not catalog identifiers and must
not be stored as game identity.

## Decision

The connector accepts a Store slug, two-letter region and optional locale. The
server constructs the official regional Ubisoft Store URL, fetches it with a
timeout, and parses available structured page data into a temporary
`UbisoftStorePreview` observation:

- official regional Store URL;
- Store slug;
- product ID and SKU when exposed by the official page;
- title, description, image and release date when exposed;
- capture timestamp and official Store source kind.

The preview endpoint requires an authenticated active administrator session and
does not mutate the catalog. A separate Super Admin confirmation refetches the
official page on the server, validates the KnownGDB catalog UUID and review
reason, then persists an idempotent Ubisoft listing and each observed provider
identity through an audited database function.

Missing product IDs or SKUs remain missing evidence. The connector does not
infer a product ID from a slug, or merge an edition, DLC, season pass or other
product with its base game.

## Consequences

- The browser never supplies provider credentials or arbitrary fetch URLs.
- Region, locale, Store slug, product ID and SKU remain independently recorded.
- Activation keys, account values and redemption codes are excluded from catalog
  identity.
- Regional pricing and page structure can change; observations retain their
  capture timestamp and incomplete metadata is not silently promoted to catalog
  facts.

## Verification

Parser tests cover metadata extraction, product identity extraction, regional
URL construction and malformed identifier rejection. Database replay tests cover
verified persistence, idempotent updates and untrusted source rejection. The
admin surface labels observations as not persisted until explicit Super Admin
confirmation.
