# ADR 0007: Recover the local database baseline

Date: 2026-10-20. Status: implemented and verified with the full local stack.

Recover the six original schema migrations from the existing migration ledger
through read-only queries, preserving recorded names, versions and normalized
SHA-256 digests. Do not invent a replacement history or export hosted Auth/data rows.

The later history migration assumed a populated project. Its local designation
block may skip only an entirely empty Auth/admin inventory, while retaining the
strict existing-user guard. Record this adaptation and original remote digest
explicitly. Never rewrite or repair the applied remote ledger or replay existing
versions remotely. A fresh local database has no automatically privileged user.

The official CLI configuration defines the local PostgreSQL 17/Auth/API/mail stack.
A Docker-compatible runtime remains optional for frontend work and ordinary API
tests, but required to validate the complete local Supabase stack.

A pinned development-only embedded PostgreSQL runner verifies migrations without
containers. Native engine files stay in ignored node_modules; disposable cluster
data and credentials stay outside Git. No system service or OS user is created.
Minimal test-only Auth tables satisfy SQL dependencies; they do not replace real
Supabase Auth behavior. PostgreSQL 17.10 SQL verification is distinct from the
inspected hosted 17.11 engine and full Supabase container acceptance.

Schema replay, RLS/grants, designation guards and rollback-only domain checks run
inside `npm run check`. Full container acceptance separately passed on PostgreSQL
17.11 with actual Auth/REST, captured mail and browser account flows. Disposable
users verified confirmation, sign-in, profile persistence, HttpOnly cookies,
reloads, administrative isolation, explicit Super Admin membership, logout and
password recovery. These accounts were removed; no hosted accounts were copied.
