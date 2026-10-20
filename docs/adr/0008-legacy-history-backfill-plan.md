# ADR 0008: Plan the legacy history backfill

Date: 2026-10-20. Status: planning implemented and locally verified; remote application pending.

## Decision

Prepare a deterministic, offline plan from verified inventories. This phase has
no apply mode, network calls, remote SQL or object writes. Keep the actual plan
and complete source snapshots in ignored `.local/`, outside public source.

Scope this first backfill to registered, approved/published official originals
with completed upload intents and active Super Admin uploaders. Derive uploader
identity from the completed intent, never from reviewer identity or the current
operator. Require original source, rights and review evidence; do not infer a
personal author. The expired incomplete upload remains untouched and excluded.

Reuse each legacy asset UUID as its collection UUID and initial version UUID,
in their separate table namespaces. The plan records the legacy ID, old object
key, new object key and complete source/upload snapshots explicitly. Existing
target IDs or keys cause a failure requiring investigation, not an overwrite or
an assumed successful resume. Each current role has a separate initial collection.

Compute new keys through the existing canonical-key policy, using original
creation time in UTC, role, provenance and language scope. Preserve original
timestamp strings, validity, language tags, source, rights and reviewer metadata.
Use base context for this initial legacy import; no seasonal identity is inferred
from a filename. Historical approval and storage-copy time are distinct.

Proposed versions remain private and have no storage-verification timestamp.
The plan also records their original desired publication status. Copies must be
created without overwriting any destination and independently read/hash-verified
before a future application step can set storage verification. Publication is
an explicit subsequent operation; planning does not change existing publication.

## Required application work

The planner is not a migration executor. Before remote application, implement and
review a durable legacy/version mapping with foreign keys, import actor/time,
full source snapshot and copy-verification evidence. Preserve legacy fields not
currently represented in versions, including confidence, MIME type and dimensions.
Do not weaken existing triggers or delete the legacy records to simplify import.

Refresh live rows, membership and storage evidence before writes. Compare source
snapshots under database locks and commit the collections, versions, mapping and
import audit together. Record the actual import time separately from historical
creation/review times; do not fabricate historical events. Schema changes must
use a new migration, never a rewrite of applied history.

Storage and database operations cannot share one transaction. Retain source
objects throughout. If database registration fails after verified copies exist,
keep those copies private and record the interruption; investigate and compare
them before a deliberate resume. Never delete either copy as automatic cleanup.

## Validation and limits

The private live-evidence plan contains six initial versions and retains one
incomplete object. Unit checks reject corrupt evidence, missing attribution,
insufficient permissions/rights, changed language tags and target conflicts.
Disposable PostgreSQL accepts the actual planner-generated collection/version
records, preserves the source row and rejects publishing without verified storage.
These checks do not perform remote copies, persist mappings or test an executor.
