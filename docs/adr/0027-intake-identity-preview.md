# ADR 0027: Initial intake identity preview

Status: local implementation; hosted activation and real-service acceptance pending.

`POST /api/v1/integrations/intake/preview` accepts 1 to 20 client-correlated
identifiers. It validates duplicate identifiers and client IDs, then uses the
existing `identity:resolve` credential and quota. It does not persist an intake,
create an item, change metadata or publish anything. The per-item decision is
`review_existing`, `review_new`, `review_identity` or `conflict`, derived from
identity evidence. `review_new` means only that no matching external identity was
found; it does not establish that a catalog item does not exist. No matching by
name occurs. Input and response use the existing bounded JSON transport.

This is an identity-only first slice: it does not yet accept game fields, compare
revisions, produce field-level changes or approve writes. Those capabilities
require further contracts, authorization, conflict controls and tests. Integration
credentials remain read-only. Real-service acceptance and deployment are
separate from local tests.
