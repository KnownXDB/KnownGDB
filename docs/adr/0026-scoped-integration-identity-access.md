# ADR 0026: Scoped integration identity access

Status: local implementation; hosted activation and real-service acceptance pending.

A Super Admin with an active session can issue and revoke service
credentials with an optional expiration. Secrets are generated server-side, shown once and stored as hashes.
Creation and revocation record an actor and reason. A dedicated credential grants
only `identity:resolve`; consumption keys and account sessions do not acquire
this scope. The integration resolution endpoint uses HTTPS outside loopback,
validates the bearer credential and applies a database-serialized quota of 30
requests per minute per credential. It then applies the same bounded identity
resolution as the administrative endpoint. It does not permit catalog writes,
asset uploads or publication. Revocation affects subsequent authorization;
requests already authorized may complete. No private key is exposed to browsers
other than the one-time issuance response to the authenticated administrator.

Management and service APIs require local and real-service acceptance. Rate limits
are an initial operational bound rather than an SLA. Migration and deployment
require separate explicit authorization; never apply changes to shared data as
part of disposable database tests.
