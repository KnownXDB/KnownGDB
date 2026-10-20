import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { S3Client } from "@aws-sdk/client-s3";
import {
  executeLegacyBackfill,
  type BackfillPlan,
} from "./execute-legacy-backfill.ts";
import { R2BackfillStorage } from "./r2-backfill-storage.ts";
import type { BackfillInput } from "./plan-legacy-backfill.ts";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      plan: { type: "string" },
      apply: { type: "boolean" },
      "expected-project": { type: "string" },
      "expected-bucket": { type: "string" },
      "expected-account": { type: "string" },
    },
    strict: true,
  });
  const planFile = values.plan ?? positionals[0];
  if (!planFile || positionals.length > (values.plan ? 0 : 1))
    throw Error("Provide one reviewed private plan.");
  const plan: BackfillPlan = JSON.parse(fs.readFileSync(planFile, "utf8"));
  if (!values.apply) {
    console.log(
      JSON.stringify({
        mode: "preview",
        plannedVersions: plan.entries.length,
        remoteWrites: 0,
      }),
    );
    return;
  }
  const env = process.env;
  if (
    !values["expected-project"] ||
    !/^[a-z0-9]{20}$/.test(values["expected-project"]) ||
    env.SUPABASE_URL !== `https://${values["expected-project"]}.supabase.co` ||
    !values["expected-account"] ||
    !/^[a-f0-9]{32}$/.test(values["expected-account"]) ||
    env.R2_ACCOUNT_ID !== values["expected-account"] ||
    !values["expected-bucket"] ||
    env.R2_BUCKET !== values["expected-bucket"] ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET) ||
    !env.SUPABASE_SECRET_KEY ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      env.BACKFILL_IMPORTER_ID ?? "",
    )
  )
    throw Error(
      "Explicit matching project/account/bucket and private credentials are required.",
    );
  const root = path.resolve(".local");
  fs.mkdirSync(root, { recursive: true });
  if (fs.lstatSync(root).isSymbolicLink())
    throw Error("Private journal directory must not be a link.");
  const journal = path.join(root, `legacy-import-${Date.now()}.jsonl`);
  execFileSync("git", ["check-ignore", "--quiet", journal]);
  if (
    execFileSync("git", ["ls-files", "--", journal], {
      encoding: "utf8",
    }).trim()
  )
    throw Error("Private journal must not be tracked.");
  const fd = fs.openSync(journal, "wx", 0o600);
  const record = (event: object) => {
    fs.writeSync(
      fd,
      JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n",
    );
    fs.fsyncSync(fd);
  };
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    db: { retry: false },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  try {
    record({
      stage: "preflight-started",
      project: values["expected-project"],
      account: values["expected-account"],
      bucket: values["expected-bucket"],
      planSha256: createHash("sha256")
        .update(fs.readFileSync(planFile))
        .digest("hex"),
    });
    const registry = await client
      .schema("catalog")
      .from("legacy_asset_imports")
      .select("legacy_asset_id")
      .limit(0);
    if (registry.error)
      throw Error("Reviewed import migration is unavailable.");
    const read = async (table: string) => {
      const rows = [];
      for (let start = 0; ; start += 500) {
        const result = await client
          .schema("catalog")
          .from(table)
          .select("*")
          .order(table === "admin_members" ? "user_id" : "id")
          .range(start, start + 499);
        if (result.error) throw Error("Catalog preflight read failed.");
        rows.push(...result.data);
        if (result.data.length < 500) return rows;
      }
    };
    const [assets, uploads, members, collections, versions] = await Promise.all(
      [
        read("assets"),
        read("asset_uploads"),
        read("admin_members"),
        read("asset_collections"),
        read("asset_versions"),
      ],
    );
    if (
      !members.some(
        (row) =>
          row.user_id === env.BACKFILL_IMPORTER_ID &&
          row.active &&
          row.role === "super_admin",
      )
    )
      throw Error("Import actor is not an active Super Admin.");
    const storage = new R2BackfillStorage(s3, env.R2_BUCKET);
    const evidence = await storage.inventory();
    const current: BackfillInput = {
      checkedAt: new Date().toISOString(),
      assets,
      uploads,
      members,
      existingCollectionIds: collections.map((row) => row.id),
      existingVersionIds: versions.map((row) => row.id),
      ...evidence,
    };
    const result = await executeLegacyBackfill(
      plan,
      current,
      storage,
      async (receipts) => {
        record({
          stage: "database-registration-started",
          count: receipts.length,
        });
        const response = await client.rpc("import_legacy_asset_batch", {
          p_entries: receipts,
          p_actor: env.BACKFILL_IMPORTER_ID,
        });
        if (response.error)
          throw Error(
            "Database registration failed or its outcome is uncertain; do not retry automatically.",
          );
        return response.data;
      },
      record,
    );
    console.log(JSON.stringify(result));
  } catch (error) {
    record({
      stage: "interrupted",
      recovery:
        "Retain originals and copies; inspect database and journal before a deliberate resume",
    });
    throw error;
  } finally {
    s3.destroy();
    fs.closeSync(fd);
  }
}
main().catch(() => {
  // SDK/server diagnostics can contain private request data. Do not print them.
  console.error(
    "Import did not complete. Check configuration and the private journal; do not retry uncertain writes.",
  );
  process.exitCode = 1;
});
