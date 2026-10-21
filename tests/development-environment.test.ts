import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

test("isolated development drops hosted storage and account credentials before spawning services", () => {
  const launches: { env: Record<string, string> }[] = [];
  const source = readFileSync("scripts/dev.mjs", "utf8").replace(
    /^import .*;\r?\n/gm,
    "",
  );
  vm.runInNewContext(source, {
    fs: { existsSync: () => true },
    path,
    process: {
      argv: ["node", "scripts/dev.mjs", "--local"],
      execPath: process.execPath,
      env: {
        PATH: "fixture-path",
        SUPABASE_SECRET_KEY: "fixture-account",
        SESSION_SECRET: "fixture-session",
        R2_READ_ACCESS_KEY_ID: "fixture-reader",
        R2_READ_SECRET_ACCESS_KEY: "fixture-secret",
        R2_BUCKET: "fixture-bucket",
        AWS_ACCESS_KEY_ID: "fixture-importer",
        AWS_SECRET_ACCESS_KEY: "fixture-import-secret",
      },
      on: () => {},
    },
    spawn: (
      _executable: string,
      _args: string[],
      options: { env: Record<string, string> },
    ) => {
      launches.push(options);
      return { on: () => {}, kill: () => {} };
    },
  });
  assert.equal(launches.length, 3);
  for (const { env } of launches) {
    assert.equal(env.PATH, "fixture-path");
    assert.equal(env.API_PORT, "8788");
    assert.ok(
      !Object.keys(env).some((key) =>
        /SUPABASE|SESSION_SECRET|R2_|AWS_/.test(key),
      ),
    );
  }
});
