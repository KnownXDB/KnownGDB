# ADR 0030: Staged text transfer

Status: local implementation; hosted activation and end-to-end acceptance pending.

An integration credential with the distinct `intake:text` scope may stage a
UTF-8 text transfer without changing catalog items. Identity-resolution keys do
not authorize this capability. The credential has the existing expiration,
revocation, audit and per-credential request quota; creation requires a Super
Admin session and explicit scope.

`POST /api/v1/integrations/text-transfer` supports `create`, `chunk`, `complete`
and `delete`. A client supplies a UUID idempotency key, total byte count and
SHA-256. Chunks have zero-based indices, canonical base64, a SHA-256 and exact
256 KiB size except the final chunk. Duplicate identical create/chunk/complete
requests return the existing state; different content under the same key or index
is rejected. Completion reassembles in order and verifies byte count, SHA-256
and UTF-8 before marking complete. Staged bytes are private and scoped to the
credential. Completion does not ingest or publish metadata.

One transfer of at most 64 MiB is retained per credential for up to one day of
access. Requests and chunks are bounded; text exceeding the transfer bound must
remain intact on the source. Expired transfers are deleted opportunistically on
subsequent authorized transfer activity; this does not guarantee timely physical
purge when no requests occur. A scheduled cleanup and integration with a future
idempotent intake operation remain necessary. A client should explicitly delete
completed transfers after their eventual consumption. Revocation prevents access;
in-flight authorized transactions may finish. Migrations, scheduling and hosted
deployment require separate explicit authorization.

SQL tests use disposable PostgreSQL, and HTTP tests use a simulated RPC. They do
not establish actual PostgREST bytea transport, real-account acceptance or
end-to-end consumption of staged text. Production activation must validate those
boundaries in an isolated full stack.
