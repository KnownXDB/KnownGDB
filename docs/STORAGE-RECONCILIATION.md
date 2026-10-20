# Legacy storage reconciliation

Verified: 2026-10-20. Scope: read-only inventory and byte integrity, not a data
migration, publication decision or deletion approval.
This records the seven-object snapshot before the separately authorized
[six-version import](LEGACY-IMPORT-RUNBOOK.md). That later operation preserves
these originals and adds six verified copies and private version mappings.

## Result

| Classification | Count | Evidence and disposition |
| --- | ---: | --- |
| Registered legacy originals | 6 | Exact object-key matches; preserve existing rows and objects |
| Expired incomplete upload | 1 | Exact upload-intent match, no completed upload or asset row; retain privately |
| Missing registered objects | 0 | Every legacy asset resolves to an object |
| Unclassified stored objects | 0 | Every object resolves to an asset or the incomplete upload |
| Integrity discrepancies | 0 | Body SHA-256 and byte size match stored metadata; registered rows also agree |

The six registered assets belong to one canonical game: header, capsule, hero,
logo, icon and client icon. Each has a distinct checksum and a completed upload
record. All six have official provenance, localized English metadata and
approved/published status in the existing database. These are recorded editorial
values; byte integrity does not independently establish language, authorship or
distribution rights.

The seventh object is a different PNG logo associated with an expired,
uncompleted upload intent for the same game. Its bytes, size and SHA-256 agree
with that intent. It is not an unexplained orphan or a duplicate of a registered
checksum. An incomplete intent does not authorize creating a published asset.
The file remains private and unchanged for a future explicit editorial decision.

All seven bodies were read through the authenticated Cloudflare API and hashed
in memory. No media files were saved to source. R2's public development URL is
disabled and no custom domains are attached. This checks bucket-level public
access; it does not certify any pre-existing application gateway or signed URL.

## Identity and history boundary

Existing keys use `originals/<game-id>/<asset-id>.<extension>` and agree with
their canonical database identities. Keep these exact legacy pointers intact.
They do not implement the newer chronological/version key layout.

At this snapshot, the newer collections and versions tables were empty. Reconciliation does not
silently backfill them, fabricate uploader credit, change review decisions or
rename objects. A separate reviewed backfill must preserve the legacy-to-version
mapping, original checksums, source/rights references, languages and audit history.
If canonical version keys require additional copies, retain every legacy original
and verify the new copy before linking it. Never overwrite a preserved original
or infer that a newly copied object's storage date is its historical creation date.

## Repeatable comparison

The next phase has a [reviewable backfill plan](adr/0008-legacy-history-backfill-plan.md).
Generate it with `npm run storage:plan-backfill -- <private-input.json> .local/<new-plan>.json`.
The input extends the reconciliation inventory with complete legacy rows,
completed-upload actor IDs, current administrative memberships and existing target
IDs; see `BackfillInput` in [the planner](../scripts/plan-legacy-backfill.ts).
Use a new output filename: the command refuses to overwrite plans. Output is
private, contains no credentials, and does not execute copies or database writes.

`npm run storage:reconcile -- <private-inventory.json>` compares a captured
inventory without loading environment files, opening connections or writing data.
It prints counts only and exits unsuccessfully on missing bodies, inconsistent
hashes/sizes/types, duplicate keys, identity mismatches or unresolved objects.
It checks legacy originals; it is not a general validator for new version keys.

The input contract is `StorageInventory` in
[the comparison script](../scripts/storage-reconciliation.ts): a timestamp,
selected legacy asset/upload rows, a complete R2 object listing and independently
computed body observations. The script checks supplied evidence; it cannot prove
the completeness, freshness or origin of an external export. Do not substitute
ETags for SHA-256 or infer a body hash from listing metadata.

Actual inventories and comparison details remain in ignored `.local/`; they
contain private object identifiers and must not be committed. Credentials are
read separately for collection and are never included in the comparison input.
The live collection used existing authenticated sessions with GET/SELECT only.
Before any future write, refresh both inventories and revalidate their state;
these independent service snapshots are not a cross-service transaction.

No R2 object, database row, bucket policy, Auth account or hosted service was
modified during this reconciliation. Development continues against the existing
hosted Supabase project; no isolated development stack was started.

API references: [list objects](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/list/)
and [get object](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/get/).
