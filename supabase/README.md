# Database migration scope

The history/credit migration extends the existing reviewed catalog and preserves
its rows. It was created with the official CLI and tested in a rollback-only
transaction before applying it to the existing project. Its filename matches the
version recorded by the remote migration tool.

All six earlier migrations have been recovered from the existing project's
migration ledger using read-only queries. Their recorded versions and names are
preserved, without exporting Auth users or application rows. The normalized
SHA-256 digests in `migration-provenance.json` are checked by `npm run db:test`.

The later history/credit migration has one documented local-replay adaptation:
skip administrator designation only when both Auth and admin inventories are
empty. Its original strict guard still applies to nonempty databases. The applied
remote migration was not edited, replayed or repaired; its original digest is
recorded separately. The adapted local file is not claimed to be byte-identical.

## Container-free SQL verification

`npm run db:test` uses a pinned development-only dependency to start disposable
PostgreSQL 17 on an ephemeral loopback port with a random test password. Cluster
files stay outside Git and are removed after shutdown. The runner never loads
`.env`, accepts remote URLs, installs a system service or creates OS users.
Reviewed native-library symlinks are restored only inside the dependency folder;
installation retains `npm ci --ignore-scripts`.

Tests replay all nine migrations and check thirteen RLS tables, SQLSTATE 42501
for browser roles and service access. Administrator guards cover empty, existing
and ambiguous inventories. Asset-history checks roll back. Minimal Auth tables satisfy
foreign-key and trigger dependencies; this is not a full GoTrue/PostgREST test.
The native engine is PostgreSQL 17.10; the inspected hosted engine is 17.11.
No hosted engine version changes. Full-stack acceptance uses Supabase's PG17 image.

## Full local Supabase stack

The ninth migration adds indexed version pagination and a service-only publication
transaction. Tests cover permission, session expiry, eligibility, conflicts and
audited publication/withdrawal. See [ADR 0009](../docs/adr/0009-explicit-version-publication.md).
Its applied version is `20261020212708`; the normalized source digest matches the
hosted ledger. All six imported versions remain private after schema application.

The eighth migration adds the locally verified legacy import registry and guarded
transactional RPC. It is recorded as `20261020210124` in the hosted project after
the seven earlier migrations; six private versions and mappings were verified.
Its source digest matches the applied ledger statement. See the [import runbook](../docs/LEGACY-IMPORT-RUNBOOK.md)
before any schema application or storage writes.

Install a supported Docker-compatible runtime, then run `npm run db:start`.
`config.toml` defines an independent local project with PostgreSQL 17, explicit
grants, catalog API schema, Studio and captured email. Email confirmation remains
enabled. Exact web/admin recovery URLs are allowlisted. Supabase Storage and
unrelated services are disabled; R2 integration remains separate.

Run `npm run db:configure:local` to obtain credentials through the official CLI
and write the ignored `.local/supabase.env`; the hosted root `.env` stays unchanged.
Run `npm run dev:local` to use that isolated configuration. The API uses the
private local server key; frontends never receive it. Register a local
user, confirm its email in the local mail interface, and explicitly provision
only that local user's admin membership through local Studio if needed. No user
is seeded or automatically promoted; do not copy the hosted administrator.

`npm run db:reset:local` explicitly resets only local data and replays migrations.
`npm run db:stop` stops the local stack. Never add `--linked`, reset the hosted
database or repair its history. Full container-stack startup and browser account
flows passed locally with PostgreSQL 17.11. See the isolated environment commands
in [local development](../docs/LOCAL-DEVELOPMENT.md); they preserve the root `.env`.

`tests/asset-history.sql` runs after the migration inside a rollback-only
transaction. It checks canonical ownership, UTC keys, revision numbers, credit
registration, original immutability, publication gates and audit history. It
requires the verified existing administrator and game and never commits fixtures.

Backend-only catalog access is preserved: new tables have RLS and no anon or
authenticated grants. Runtime authorization must verify the user and current
membership before privileged writes. No public contributor profile was invented
for the existing user; they choose their own public display name before personal
credit is enabled.
