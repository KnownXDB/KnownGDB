# ADR 0023: Bounded derived image delivery

Date: 2026-11-17. Status: implemented locally; hosted acceptance pending.

## Decision

Deliver card and gallery images through `/api/v1/asset-versions/:id/thumbnail`
and `/display`, with equivalent authenticated administrator routes. These fixed
variants bound the longest side to 480 and 1280 pixels, respectively, preserve
aspect ratio and transparency, and encode PNG and JPEG inputs as WebP. ICO files
are delivered in their original format because bitmap ICO decoding is not supported
by the image processor. The existing `/preview` and `/download` endpoints retain
their original byte-exact behavior. No client supplies storage keys or dimensions.

The API verifies the original key, media signature, length, type and SHA-256 before
creating a derivative. Decoding is restricted to the existing 40-million-pixel
input limit. Derivatives are generated lazily and retained in a process-local,
32 MiB least-recently-used cache keyed by storage identity, version checksum and
variant. Cache loss or a cold server requires another original read and transform;
the cache is not shared or persistent and does not write to storage.

Every request that reaches the API, including server-cache hits and conditional requests, rechecks the current
publication, moderation, game and rights state or the administrative session.
Public derivatives use `private, max-age=300, must-revalidate` with an ETag.
A browser can reuse a previously public image for at most five minutes without a
server request, including after withdrawal; after expiry it must revalidate and
an ineligible version returns 404. Administrator responses remain `private,
no-store`. The catalog stores up to twelve public artwork references in session
storage for five minutes, preloads them and refreshes them against the API. Cached
references never grant access to private versions or change API authorization.
The visible catalog and gallery refresh public metadata every minute and when a tab becomes
visible; if the artwork lookup fails, cached references are removed from view.
A background tab may not execute timers until it becomes visible again.
Originals retain their existing no-store behavior. This does not provide CDN edge
caching, protect bytes already saved by a recipient, or eliminate database latency.

The Netlify bundle keeps the native image processor external. Cross-platform npm
installation requires optional platform dependencies. A hosted build and the
native module in the deployed function still require independent acceptance.

## Validation

Local tests cover dimensions, format, cache hits, conditional responses, withdrawal,
admin authentication and unchanged original delivery. Local browser verification
must distinguish warm in-process results from cold starts and shared-cache behavior.
