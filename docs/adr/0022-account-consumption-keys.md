# ADR 0022: Account consumption keys

Status: implemented locally; hosted acceptance pending.

Confirmed account owners manage consumption keys through the existing encrypted
cookie session boundary. The API verifies Auth identity and the database rechecks
session ownership and expiry. Database functions are service-only and tables use
RLS with no browser grants. Keys contain 256 random bits, are stored as SHA-256
hashes, shown once, and expire after 90 days. Lists expose only metadata.

The initial scope is `catalog:read` through `/api/v1/consumer/games`, sharing the
approved published catalog projection. Keys never authorize account or admin
operations. Revocation precedes future authorizations; rotation creates a new key
before revoking its predecessor. Last usage is recorded across API instances.
Commercial plans and measured operational rate limits remain a separate delivery.

See [consumption documentation](../API-CONSUMPTION.md) for activation and acceptance.
