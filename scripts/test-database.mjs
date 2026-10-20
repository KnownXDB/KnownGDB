import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import EmbeddedPostgres from "embedded-postgres";

// This runner has no remote URL option and never loads .env.
const provenance = JSON.parse(
  fs.readFileSync("supabase/migration-provenance.json", "utf8"),
);
for (const migration of provenance.recovered) {
  const content = fs.readFileSync(
    `supabase/migrations/${migration.version}_${migration.name}.sql`,
  );
  assert.equal(
    createHash("sha256").update(content).digest("hex"),
    migration.sha256,
    `Recovered migration changed: ${migration.version}`,
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
assert.equal(migrationFiles.length, 7);
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
  assert.equal(tables.rows.length, 12);
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
    "PASS: seven migrations on disposable PostgreSQL 17; empty/existing/ambiguous admin guards, 12 RLS tables, denied browser roles, service access and rollback-only asset-history SQL.",
  );
  console.log(
    "Auth tables are a minimal SQL contract fixture; this is not a full Supabase Auth/API stack test.",
  );
} finally {
  for (const client of clients) await client.end().catch(() => {});
  if (started) await postgres.stop();
  fs.rmSync(root, { recursive: true, force: true });
}
