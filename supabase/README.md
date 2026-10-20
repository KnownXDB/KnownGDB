# Database migration scope

The history/credit migration extends the existing reviewed catalog and preserves
its rows. It was created with the official CLI and tested in a rollback-only
transaction before applying it to the existing project. Its filename matches the
version recorded by the remote migration tool.

The six earlier catalog migrations are not reconstructed here yet. This directory
is not a complete empty-database bootstrap. Before starting a fresh isolated local
database, recover and review that baseline using official tooling. Do not run a
reset, replay the new migration on its own, or repair remote history to hide the
missing local baseline.

`tests/asset-history.sql` runs after the migration inside a rollback-only
transaction. It checks canonical ownership, UTC keys, revision numbers, credit
registration, original immutability, publication gates and audit history. It
requires the verified existing administrator and game and never commits fixtures.

Backend-only catalog access is preserved: new tables have RLS and no anon or
authenticated grants. Runtime authorization must verify the user and current
membership before privileged writes. No public contributor profile was invented
for the existing user; they choose their own public display name before personal
credit is enabled.
