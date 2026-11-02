# ADR 0017: Xbox and Microsoft Store official page connector

Status: accepted; local preview and explicit reviewed persistence implemented.

## Context

KnownGDB needs a first-party observation before associating a Microsoft Store
product with a canonical catalog item. Microsoft identifies Store products with
a 12-character Store/Product ID. Xbox publishing also exposes other identifiers,
including Xbox Title ID and Xbox Service Configuration ID; those identifiers are
not interchangeable with the Store ID or the KnownGDB catalog UUID.

## Decision

The first Xbox connector accepts only a 12-character uppercase alphanumeric
Store ID. The server constructs the documented official Microsoft Store URL on
`apps.microsoft.com`, fetches it with a timeout, and parses available structured
and standard page metadata into a temporary `XboxStorePreview` observation:

- Microsoft Store/Product ID;
- official Microsoft Store URL;
- title, description, image and release date when exposed;
- capture timestamp and official page source kind.

The preview endpoint requires an authenticated active administrator session and
does not mutate the catalog. A separate Super Admin confirmation refetches the
official page on the server, validates the KnownGDB catalog UUID and review
reason, then persists an idempotent Xbox listing and `xbox.store_id` identity
through an audited database function.

Xbox Title ID, Xbox Service Configuration ID, MSA App ID and package identity
values remain separate external identities. This connector does not infer or
invent them from a Store ID; a future reviewed evidence flow must provide the
appropriate official Partner Center or Xbox publishing evidence.

## Consequences

- The browser never supplies provider credentials or arbitrary fetch URLs.
- A Store ID is evidence attached to a KnownGDB item, never a replacement for
  its immutable UUID.
- Page extraction can be incomplete and is retained as an observation timestamp,
  not silently promoted to general catalog metadata.
- The same connector pattern can be extended to reviewed Xbox publishing
  identifiers without collapsing distinct namespaces.

## Verification

Parser tests cover metadata extraction, official URL construction and malformed
identifier rejection. Database replay tests cover verified persistence,
idempotent updates and untrusted source rejection. The admin surface labels
observations as not persisted until explicit Super Admin confirmation.
