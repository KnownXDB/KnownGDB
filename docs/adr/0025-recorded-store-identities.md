# ADR 0025: Recorded store product identities

Status: implemented locally; database activation and real-account acceptance pending.

Administrative users can inspect external identities by canonical catalog UUID.
The listing is bounded to 100 rows and reports truncation. It requires the active
administrative session and is not part of the public catalog projection.

A Super Admin may submit a GOG Product ID with an HTTPS evidence reference and
reason. The service-only transaction rechecks membership and active session,
serializes submissions of the same GOG Product ID, detects existing associations
with other items and records an audit event. Retrying the same association leaves
its existing review state and evidence intact. A new association is `in_review`;
a user-supplied source is not treated as independent verification. The game UUID
is unchanged. Rejected associations are preserved. This operation does not
publish data or grant any capability to a consumption key.

The advisory lock coordinates this transaction with itself; any future writer of
GOG identities must use the same serialization and conflict rules. A separate
review workflow is needed to verify, reject or correct the new association.
Migration activation is separate from source integration and requires explicit
authorization. Local database replay uses a disposable database and does not
prove real Auth, remote migration or browser acceptance.
