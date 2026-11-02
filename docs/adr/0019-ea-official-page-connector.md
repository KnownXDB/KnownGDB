# ADR 0019: EA official publisher page connector

Status: accepted; local preview and explicit reviewed persistence implemented.

## Context

EA's public game pages are official publisher pages under `ea.com/games/...`.
They link to EA app and external platform stores, but EA's public support
documentation describes product codes as redemption values, not stable catalog
identifiers. Treating a product code as a game ID would confuse a transaction
credential with catalog identity.

## Decision

The connector accepts the official EA series slug and game slug and constructs
the canonical publisher URL ending in `/buy`. It parses available standard and
structured page metadata into a temporary `EAStorePreview` observation:

- official EA publisher URL;
- series slug and game slug as separate provider namespaces;
- title, description, image and release date when exposed;
- capture timestamp and publisher-page source kind.

The preview endpoint requires an authenticated active administrator session and
does not mutate the catalog. A separate Super Admin confirmation refetches the
official page on the server, validates the KnownGDB catalog UUID and review
reason, then persists an idempotent EA listing and the two slug identities
through an audited database function.

Product codes, EA account IDs and other transactional or account values are not
accepted as catalog identity. A future connector may add a distinct EA app
product namespace only when an official stable identifier and evidence source
are documented.

## Consequences

- EA publisher evidence is preserved even when the purchase destination is Steam,
  Epic, Xbox, PlayStation or another platform.
- Series and game slugs cannot replace the immutable KnownGDB catalog UUID.
- The connector does not infer an EA app ID from a public URL or product name.
- Product pages can change their rendered structure; observations retain capture
  timestamps and incomplete metadata is not silently promoted to catalog facts.

## Verification

Parser tests cover metadata extraction, official URL construction and malformed
slug rejection. Database replay tests cover verified persistence, idempotent
updates and untrusted source rejection. The admin surface labels observations as
not persisted until explicit Super Admin confirmation.
