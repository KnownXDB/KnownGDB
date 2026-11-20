# ADR 0028: External identities for catalog terms

Status: local implementation; hosted activation and real-service acceptance pending.

A catalog organization or platform has its own UUID. A Super Admin with an
active session may explicitly associate an IGDB numeric identifier with a term
of the matching kind, with a source and reason. The association and audit event
are persisted in private RLS tables. Repeating an association is idempotent;
assigning the same provider ID and kind to another term is rejected. Organization
and platform identifiers occupy separate namespaces, even if their numbers match.
There is no name-based matching and no automatic creation or modification of a
term. Existing mappings are immutable in this slice; correction and revocation
require a separate audited workflow.

`POST /api/v1/admin/term-identities` records an association. The integration
endpoint `POST /api/v1/integrations/term-identities/resolve` resolves at most 20
`{kind, externalId}` items using the existing `identity:resolve` credential and
shared quota. Results include a term UUID or `not_found`; that status does not
prove that no equivalent term exists. The service receives no term names or
source evidence and cannot create mappings. Only explicitly reviewed mappings
are returned. No shared database is migrated by these source changes.
