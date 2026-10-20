# Legacy import execution

Status: executed and independently verified against hosted Supabase/R2 on 2026-10-20.
This operation imports the six reconciled legacy originals as private versions.
The existing published assets, their keys and the incomplete upload are preserved.
The procedure below records the completed operation. Do not rerun the same plan
or reapply the recorded migration; existing targets require explicit recovery review.

## Before application

Review the [plan](adr/0008-legacy-history-backfill-plan.md), its private evidence
and `20261020210124_legacy_asset_import_registry.sql`. This migration was applied
through the separately authorized migration workflow; never replay the seven
existing hosted migrations. The schema adds a thirteenth catalog table with
RLS, restricted grants, composite game foreign keys and an immutable import record.
It does not import data or change publication by itself.

Obtain explicit authorization for the target project, R2 account and bucket before
running the importer. Existing CLI OAuth access is sufficient for the completed
read-only audit, but is not an S3 key pair. Do not create a public bucket, deploy a
worker, export unrelated service configuration or change Auth to work around that.

Use an existing, appropriately scoped R2 S3 key pair with list/read/write access
to the intended bucket. Keep these additional values in ignored
`.local/storage-import.env`, never in chat or source:

```dotenv
R2_ACCOUNT_ID=
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
BACKFILL_IMPORTER_ID=
```

The existing root `.env` supplies `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
`BACKFILL_IMPORTER_ID` identifies the real active Super Admin performing the import;
it does not replace the independently recovered original uploader. Creating scoped
credentials or granting new privileges is a separate infrastructure decision.

## Preview and execute

Preview requires no R2 credentials or network access:

```sh
npm run storage:import -- .local/legacy-backfill-plan.json
```

The explicit application form below uses placeholders for reviewed resource
identifiers. The direct Node invocation preserves flags across shell/npm wrappers.
Never use secret values as command-line arguments:

```sh
node node_modules/tsx/dist/cli.mjs --env-file=.env --env-file=.local/storage-import.env scripts/import-legacy-assets.ts --plan .local/legacy-backfill-plan.json --apply --expected-project <project-ref> --expected-account <account-id> --expected-bucket <bucket-name>
```

The importer requires exact matches between those identifiers and its private
configuration. It confirms the new registry exists and the importer is an active
Super Admin, then obtains paginated fresh database and storage inventories.
It reads and hashes bodies; listing metadata or ETags alone are insufficient.
Any plan drift, unknown object or existing target stops the operation.

Each source is checked again immediately before a conditional destination write
with `If-None-Match: *`. A second independent GET checks destination bytes, size,
MIME type and SHA-256 metadata. SDK retries are disabled. The import adapter is
limited to the reviewed image originals, at most 16 MiB each; it is not a general
video uploader. Conditional PUT behavior is documented by
[Cloudflare R2](https://developers.cloudflare.com/r2/api/s3/api/).

After all copies pass, one server-only RPC locks and compares the full source
and upload snapshots, checks current memberships, and inserts collections,
private versions, trigger audit events and durable import records in one database
transaction. Import records retain confidence, dimensions, MIME, source/rights,
uploader evidence, actual import actor/time and copy-verification receipts. The
database cannot independently fetch R2; storage receipts come from the trusted
operator tool. Other writers must respect the immutable-key policy too.

Historical creation/review times remain historical. New import and audit times
describe the actual import. Version publication stays private. Existing public
legacy rows keep their current behavior; publishing new versions and switching
API reads are separate reviewed actions.

## Interruption and acceptance

The importer synchronously records progress in ignored `.local/legacy-import-*.jsonl`.
The journal binds the plan digest and resource identifiers, records attempted and
verified copies, and distinguishes registration start from a confirmed commit.
Only aggregate success/preview results appear on stdout; SDK/server error payloads
are not printed because they may contain private request data.

If a write times out, its outcome is uncertain. Preserve both originals and any
new copies. Inspect the journal, destination hashes and database registry before
deciding how to resume. The tool refuses existing targets, even identical ones;
it does not implement automatic resumption, deletion or rollback in R2.

Independent hosted acceptance passed after the authorized execution:

- Six collections, six private versions and six immutable import mappings.
- Thirteen R2 objects: all seven originals plus six separately verified copies.
- All thirteen bodies checked against their SHA-256 metadata and expected sizes.
- Legacy assets and all upload-intent rows unchanged, including publication.
- Complete source/upload snapshots and copy receipts match the approved plan.
- Original creation times, language tags, uploader attribution and official credit preserved.
- The incomplete upload remains retained and unregistered; zero new published versions.
- Thirteen catalog tables have RLS; anon/authenticated cannot execute the import RPC.
- The applied migration SHA-256 matches the tracked source exactly. The local
  filename follows the version assigned by the hosted migration service; no
  existing ledger record was rewritten.

Local validation also covers PostgreSQL transaction/permission failures and SDK
HTTP protocol behavior. Hosted success applies to this bounded six-original
import, not general upload/moderation, gateway delivery or production certification.
Detailed inventories, the progress journal and acceptance receipt remain ignored
under `.local/`. No credentials or private object identifiers are recorded here.
