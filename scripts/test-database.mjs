import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import EmbeddedPostgres from "embedded-postgres";
import { planLegacyBackfill } from "./plan-legacy-backfill.ts";

// This runner has no remote URL option and never loads .env.
const provenance = JSON.parse(
  fs.readFileSync("supabase/migration-provenance.json", "utf8"),
);
for (const migration of [
  ...provenance.recovered,
  ...(provenance.applied ?? []),
]) {
  const content = fs.readFileSync(
    `supabase/migrations/${migration.version}_${migration.name}.sql`,
  );
  assert.equal(
    createHash("sha256").update(content).digest("hex"),
    migration.sha256,
    `Recorded migration changed: ${migration.version}`,
  );
}
const require = createRequire(import.meta.url);
const platform = process.platform === "win32" ? "windows" : process.platform;
const nativeRoot = path.resolve(
  path.dirname(
    require.resolve(`@embedded-postgres/${platform}-${process.arch}`),
  ),
  "..",
);
const symlinks = JSON.parse(
  fs.readFileSync(path.join(nativeRoot, "native/pg-symlinks.json"), "utf8"),
);
for (const { source, target } of symlinks) {
  const from = path.resolve(nativeRoot, source),
    to = path.resolve(nativeRoot, target);
  if (
    !from.startsWith(nativeRoot + path.sep) ||
    !to.startsWith(nativeRoot + path.sep)
  )
    throw Error("Native symlink escaped its dependency directory.");
  if (!fs.existsSync(to))
    fs.symlinkSync(path.relative(path.dirname(to), from), to);
}
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "knowngdb-db-test-"));
assert.ok(
  path
    .resolve(root)
    .startsWith(path.resolve(os.tmpdir()) + path.sep + "knowngdb-db-test-"),
);
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(root, "cluster"),
  user: "postgres",
  password: randomBytes(32).toString("hex"),
  port,
  authMethod: "scram-sha-256",
  persistent: true,
  createPostgresUser: false,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
const migrationFiles = fs
  .readdirSync("supabase/migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort();
assert.equal(migrationFiles.length, 9);
const sql = migrationFiles.map((file) =>
  fs.readFileSync(path.join("supabase/migrations", file), "utf8"),
);
const authContract = `create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
  create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
  grant usage on schema auth to service_role;`;
let started = false;
const clients = [];
async function database(name) {
  await postgres.createDatabase(name);
  const client = postgres.getPgClient(name, "127.0.0.1");
  await client.connect();
  clients.push(client);
  await client.query(authContract);
  return client;
}
async function apply(client, migrations = sql) {
  for (const migration of migrations) await client.query(migration);
}
const seedUser = `insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-4000-8000-000000000001','local-fixture@example.invalid',now());
  insert into catalog.admin_members(user_id) values('00000000-0000-4000-8000-000000000001');`;
try {
  await postgres.initialise();
  await postgres.start();
  started = true;
  const admin = postgres.getPgClient("postgres", "127.0.0.1");
  await admin.connect();
  clients.push(admin);
  await admin.query(
    "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;",
  );
  const fresh = await database("fresh");
  await apply(fresh);
  assert.equal(
    (
      await fresh.query(
        "select count(*)::integer as n from catalog.admin_members",
      )
    ).rows[0].n,
    0,
  );
  const tables = await fresh.query(
    "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='catalog' and c.relkind='r'",
  );
  assert.equal(tables.rows.length, 13);
  assert.ok(tables.rows.every((row) => row.relrowsecurity));
  for (const role of ["anon", "authenticated"]) {
    await fresh.query(`set role ${role}`);
    await assert.rejects(
      fresh.query("select * from catalog.games"),
      (error) => error.code === "42501",
    );
    await fresh.query("reset role");
  }
  await fresh.query("set role service_role");
  await fresh.query("select * from catalog.games");
  await fresh.query("reset role");
  await fresh.query(
    seedUser +
      "update catalog.admin_members set role='super_admin'; insert into catalog.games default values;",
  );
  await fresh.query("begin");
  try {
    await fresh.query(
      fs.readFileSync("supabase/tests/asset-history.sql", "utf8"),
    );
  } finally {
    await fresh.query("rollback");
  }
  assert.equal(
    (
      await fresh.query(
        "select count(*)::integer as n from catalog.asset_versions",
      )
    ).rows[0].n,
    0,
  );
  // Exercise actual planner output against PostgreSQL, inside a rolled-back fixture.
  await fresh.query("begin");
  try {
    const gameId = (await fresh.query("select id from catalog.games limit 1"))
      .rows[0].id;
    const fixtureId = "00000000-0000-4000-8000-000000000010";
    const actorId = "00000000-0000-4000-8000-000000000001";
    const checksum = "a".repeat(64);
    const key = `originals/${gameId}/${fixtureId}.png`;
    const source = {
      id: fixtureId,
      game_id: gameId,
      role: "logo",
      language_kind: "localized",
      language_tags: ["en"],
      object_key: key,
      checksum_sha256: checksum,
      provenance: "official",
      source_reference: "https://example.invalid/fixture",
      rights_reference: "Synthetic rights fixture",
      confidence: 1,
      rendition: "original",
      moderation_status: "approved",
      publication_status: "published",
      created_at: "2026-10-01T00:00:00Z",
      reviewed_at: "2026-10-02T00:00:00Z",
      reviewed_by: actorId,
      valid_from: null,
      valid_until: null,
      byte_size: 100,
      mime_type: "image/png",
      width: 16,
      height: 16,
    };
    await fresh.query(
      "insert into catalog.assets select (jsonb_populate_record(null::catalog.assets,$1::jsonb)).*",
      [JSON.stringify(source)],
    );
    const input = {
      checkedAt: "2026-10-20T00:00:00Z",
      assets: [source],
      uploads: [
        {
          id: fixtureId,
          object_key: key,
          game_id: gameId,
          actor_id: actorId,
          created_at: source.created_at,
          completed_at: source.created_at,
          expires_at: source.created_at,
          metadata: { byte_size: 100, checksum_sha256: checksum },
        },
      ],
      objects: [
        {
          key,
          size: 100,
          custom_metadata: { sha256: checksum },
          http_metadata: { contentType: "image/png" },
        },
      ],
      observations: [{ key, size: 100, sha256: checksum }],
      members: [{ user_id: actorId, active: true, role: "super_admin" }],
      existingCollectionIds: [],
      existingVersionIds: [],
    };
    const entry = planLegacyBackfill(input).entries[0];
    await fresh.query(
      "insert into catalog.asset_uploads select (jsonb_populate_record(null::catalog.asset_uploads,$1::jsonb)).*",
      [JSON.stringify(input.uploads[0])],
    );
    await fresh.query("savepoint proposed_insert");
    await fresh.query(
      "insert into catalog.asset_collections select (jsonb_populate_record(null::catalog.asset_collections,$1::jsonb)).*",
      [JSON.stringify(entry.collection)],
    );
    await fresh.query(
      "insert into catalog.asset_versions select (jsonb_populate_record(null::catalog.asset_versions,$1::jsonb)).*",
      [JSON.stringify(entry.version)],
    );
    const stored = (
      await fresh.query(
        "select object_key,publication_status,storage_verified_at,revision_number from catalog.asset_versions where id=$1",
        [fixtureId],
      )
    ).rows[0];
    assert.equal(stored.object_key, entry.copy.targetKey);
    assert.equal(stored.publication_status, "private");
    assert.equal(stored.storage_verified_at, null);
    assert.equal(stored.revision_number, 1);
    const legacy = (
      await fresh.query(
        "select object_key,publication_status from catalog.assets where id=$1",
        [fixtureId],
      )
    ).rows[0];
    assert.equal(legacy.object_key, key);
    assert.equal(legacy.publication_status, "published");
    await assert.rejects(
      fresh.query(
        "update catalog.asset_versions set publication_status='published',changed_by=$1 where id=$2",
        [actorId, fixtureId],
      ),
      (error) => error.code === "23514",
    );
    await fresh.query("rollback to savepoint proposed_insert");
    const receipt = { ...entry, verifiedAt: new Date().toISOString() };
    for (const role of ["anon", "authenticated"]) {
      await fresh.query("savepoint permission_probe");
      await fresh.query(`set local role ${role}`);
      await assert.rejects(
        fresh.query(
          "select public.import_legacy_asset_batch($1::jsonb,$2::uuid)",
          [JSON.stringify([receipt]), actorId],
        ),
        (error) => error.code === "42501",
      );
      await fresh.query("rollback to savepoint permission_probe");
    }
    await fresh.query("savepoint batch_probe");
    await fresh.query("set local role service_role");
    await assert.rejects(
      fresh.query(
        "select public.import_legacy_asset_batch($1::jsonb,$2::uuid)",
        [
          JSON.stringify([
            receipt,
            {
              ...receipt,
              legacyAssetId: "00000000-0000-4000-8000-000000000099",
            },
          ]),
          actorId,
        ],
      ),
      (error) => error.code === "P0001",
    );
    await fresh.query("rollback to savepoint batch_probe");
    assert.equal(
      (
        await fresh.query(
          "select count(*)::integer as n from catalog.legacy_asset_imports",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await fresh.query(
          "select count(*)::integer as n from catalog.asset_versions",
        )
      ).rows[0].n,
      0,
    );
    await fresh.query("set local role service_role");
    await fresh.query("reset role");
    const rejectedReceipts = [
      { ...receipt, sourceSnapshot: { ...receipt.sourceSnapshot, width: 17 } },
      {
        ...receipt,
        uploadSnapshot: { ...receipt.uploadSnapshot, metadata: {} },
      },
      { ...receipt, verifiedAt: "2020-01-01T00:00:00Z" },
      { ...receipt, copy: { ...receipt.copy, sha256: "b".repeat(64) } },
      {
        ...receipt,
        copy: { ...receipt.copy, targetKey: "games/invalid/original.png" },
      },
    ];
    for (const rejectedReceipt of rejectedReceipts) {
      await fresh.query("savepoint receipt_probe");
      await fresh.query("set local role service_role");
      await assert.rejects(
        fresh.query(
          "select public.import_legacy_asset_batch($1::jsonb,$2::uuid)",
          [JSON.stringify([rejectedReceipt]), actorId],
        ),
        (error) => error.code === "P0001",
      );
      await fresh.query("rollback to savepoint receipt_probe");
    }
    await fresh.query("set local role service_role");
    const registered = await fresh.query(
      "select public.import_legacy_asset_batch($1::jsonb,$2::uuid) as result",
      [JSON.stringify([receipt]), actorId],
    );
    assert.deepEqual(registered.rows[0].result, {
      imported: 1,
      publicationStatus: "private",
    });
    await fresh.query("reset role");
    const mapping = (
      await fresh.query(
        "select source_snapshot,upload_snapshot,copy_verified_at,imported_at from catalog.legacy_asset_imports where legacy_asset_id=$1",
        [fixtureId],
      )
    ).rows[0];
    assert.equal(mapping.source_snapshot.confidence, 1);
    assert.equal(mapping.source_snapshot.width, 16);
    assert.equal(mapping.upload_snapshot.actor_id, actorId);
    assert.ok(mapping.copy_verified_at && mapping.imported_at);
    const publicationSession = "00000000-0000-4000-8000-000000000020";
    await fresh.query(
      "update catalog.games set status='published' where id=$1",
      [gameId],
    );
    await fresh.query("insert into auth.sessions(id,user_id) values($1,$2)", [
      publicationSession,
      actorId,
    ]);
    const publish = async (
      expected = "private",
      state = "published",
      session = publicationSession,
    ) =>
      fresh.query(
        "select public.set_asset_version_publication($1,$2,$3,$4,$5,$6) as result",
        [
          fixtureId,
          actorId,
          session,
          expected,
          state,
          "Explicit publication fixture",
        ],
      );
    for (const role of ["anon", "authenticated"]) {
      await fresh.query("savepoint publication_permissions");
      await fresh.query(`set local role ${role}`);
      await assert.rejects(publish(), (error) => error.code === "42501");
      await fresh.query("rollback to savepoint publication_permissions");
    }
    await fresh.query("savepoint publication_session");
    await fresh.query("set local role service_role");
    await assert.rejects(
      publish("private", "published", fixtureId),
      (error) => error.code === "28000",
    );
    await fresh.query("rollback to savepoint publication_session");
    await fresh.query("savepoint publication_expired_session");
    await fresh.query(
      "update auth.sessions set not_after=now()-interval '1 minute' where id=$1",
      [publicationSession],
    );
    await assert.rejects(publish(), (error) => error.code === "28000");
    await fresh.query("rollback to savepoint publication_expired_session");
    await fresh.query("savepoint publication_moderator");
    await fresh.query(
      "update catalog.admin_members set role='moderator' where user_id=$1",
      [actorId],
    );
    await assert.rejects(publish(), (error) => error.code === "42501");
    await fresh.query("rollback to savepoint publication_moderator");
    await fresh.query("savepoint publication_game");
    await fresh.query("update catalog.games set status='draft' where id=$1", [
      gameId,
    ]);
    await assert.rejects(publish(), (error) => error.code === "23514");
    await fresh.query("rollback to savepoint publication_game");
    for (const change of [
      "storage_verified_at=null",
      "moderation_status='rejected'",
    ]) {
      await fresh.query("savepoint publication_eligibility");
      await fresh.query(
        `update catalog.asset_versions set ${change},changed_by=$2,change_reason='Eligibility fixture' where id=$1`,
        [fixtureId, actorId],
      );
      await assert.rejects(publish(), (error) => error.code === "23514");
      await fresh.query("rollback to savepoint publication_eligibility");
    }
    await fresh.query("set local role service_role");
    assert.equal(
      (await publish()).rows[0].result.publicationStatus,
      "published",
    );
    await fresh.query("savepoint publication_conflict");
    await assert.rejects(publish(), (error) => error.code === "40001");
    await fresh.query("rollback to savepoint publication_conflict");
    assert.equal(
      (await publish("published", "private")).rows[0].result.publicationStatus,
      "private",
    );
    await fresh.query("reset role");
    const publicationEvents = (
      await fresh.query(
        "select action,actor_id,reason from catalog.asset_version_events where version_id=$1 order by id desc limit 2",
        [fixtureId],
      )
    ).rows;
    assert.deepEqual(
      publicationEvents.map((row) => row.action),
      ["withdrawn", "published"],
    );
    assert.ok(
      publicationEvents.every(
        (row) =>
          row.actor_id === actorId &&
          row.reason === "Explicit publication fixture",
      ),
    );
    assert.equal(
      (
        await fresh.query("select object_key from catalog.assets where id=$1", [
          fixtureId,
        ])
      ).rows[0].object_key,
      key,
    );
    console.log(
      "PASS: publication requires active Super Admin/session, eligibility and expected state; publish/withdraw audit preserves originals.",
    );
    await fresh.query("savepoint immutability_probe");
    await assert.rejects(
      fresh.query("update catalog.legacy_asset_imports set imported_at=now()"),
      (error) => error.code === "P0001",
    );
    await fresh.query("rollback to savepoint immutability_probe");
  } finally {
    await fresh.query("rollback");
  }
  console.log(
    "PASS: planned legacy imports satisfy real schema and remain private without destination storage verification; source rows are preserved.",
  );
  const existing = await database("existing");
  await apply(existing, sql.slice(0, 6));
  await existing.query(seedUser);
  await apply(existing, sql.slice(6));
  assert.equal(
    (await existing.query("select role from catalog.admin_members")).rows[0]
      .role,
    "super_admin",
  );
  const ambiguous = await database("ambiguous");
  await apply(ambiguous, sql.slice(0, 6));
  await ambiguous.query(
    seedUser +
      "insert into auth.users(id) values('00000000-0000-4000-8000-000000000002');",
  );
  await assert.rejects(
    apply(ambiguous, sql.slice(6)),
    (error) => error.code === "P0001",
  );
  console.log(
    "PASS: nine migrations on disposable PostgreSQL 17; empty/existing/ambiguous admin guards, 13 RLS tables, denied browser roles, transactional import/publication and rollback-only asset-history SQL.",
  );
  console.log(
    "Auth tables are a minimal SQL contract fixture; this is not a full Supabase Auth/API stack test.",
  );
} finally {
  for (const client of clients) await client.end().catch(() => {});
  if (started) await postgres.stop();
  fs.rmSync(root, { recursive: true, force: true });
}
