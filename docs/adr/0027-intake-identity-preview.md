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

An optional `proposal` can provide `originalTitle` and/or `gameType`. For a
verified identity, the preview compares only those supplied fields with the
approved metadata of a published item and returns the public revision ID and
per-field differences. Unknown fields and invalid proposals are rejected; an
omitted field never means deletion. If no approved public revision is available,
the comparison is unavailable. Pending or ambiguous identities do not trigger a
metadata read. This slice does not compare detailed releases, assets or unpublished revisions,
and does not authorize updates.

Localized proposals can include up to eight canonical language tags and supplied
title, summary or description fields. Each provided field is compared with the
published localization of that language; missing languages are represented as
absent, and omitted fields do not mean deletion. Explicit empty summary or
description remains a proposed value. Preview requests are limited to 1 MiB
in both the API and local Node adapter. No pending revision is queried.

Optional `credits` compare explicit organization UUID, role, release UUID and
region as a complete scope against approved credits. Optional `platformIds`
report whether a platform UUID appears in any approved release; this does not
compare release dates, editions or regions. These are presence checks only:
unmentioned entries are not removals, and a missing ID is not proof that the
term exists or should be created. Provider names must be resolved separately.
