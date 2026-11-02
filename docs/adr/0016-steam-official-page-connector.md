# ADR 0016: Steam official page connector

Status: accepted; local preview and explicit reviewed persistence implemented, scheduled ingestion pending.

## Context

KnownGDB needs an official first-party observation before an administrator can
associate a Steam App ID and store listing with a canonical catalog item. The
first connector must be useful without exposing a Steam key to the browser or
accepting arbitrary URLs that could create an SSRF boundary.

## Decision

The first Steam connector accepts only a numeric Steam App ID. The server
constructs the official Store URL on `store.steampowered.com`, applies bounded
region and locale values, and fetches the page with a timeout. It parses
structured metadata and standard official page metadata into a temporary
`SteamStorePreview` observation:

- Steam App ID;
- official Store URL;
- title, description, image and release date when exposed;
- region and locale;
- capture timestamp and source kind.

The preview endpoint requires an authenticated active administrator session. It
does not create a `store_listings` or `external_identities` row. A separate
Super Admin confirmation refetches the official page on the server, validates
the canonical game UUID and review reason, then persists the listing and App ID
through an idempotent audited database function. It does not publish general
game metadata.
Invalid IDs, regions, locales and non-official hosts are rejected before any
network request. Page parsing is tolerant: missing structured metadata produces
an incomplete observation rather than invented values.

## Consequences

- Steam can be previewed without remote database mutation and persisted only by
  an explicit Super Admin review action.
- The browser never supplies or receives provider credentials.
- Official page changes can affect extraction and therefore previews retain a
  capture timestamp and must not silently become published facts.
- App-list discovery and partner-authenticated Steamworks operations remain
  separate capabilities; this connector does not claim that a public catalog
  API exists for every field.

## Verification

Parser tests cover title cleanup, metadata extraction, region/locale handling,
official-host construction and malformed-input rejection. Database replay tests
cover verified persistence, idempotent updates and untrusted source rejection.
The admin surface labels observations as not persisted until the explicit
Super Admin confirmation.
