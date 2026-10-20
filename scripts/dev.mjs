import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
const local = process.argv.includes("--local");
if (local && !fs.existsSync(".local/supabase.env"))
  throw Error("Run npm run db:configure:local after starting the local stack.");
const runtimeEnv = { ...process.env, ...(local ? { API_PORT: "8788" } : {}) };
if (local)
  for (const key of Object.keys(runtimeEnv))
    if (/SUPABASE|SESSION_SECRET|ACCOUNT_RECOVERY_URL/.test(key))
      delete runtimeEnv[key];
const children = [];
const run = (script, args, env) => {
  const child = spawn(process.execPath, [script, ...args], {
    stdio: "inherit",
    env,
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code) {
      stop();
      process.exitCode = code;
    }
  });
};
function stop() {
  for (const child of children) if (!child.killed) child.kill();
}
process.on("SIGINT", () => {
  stop();
});
process.on("SIGTERM", () => {
  stop();
});
const frontendEnv = Object.fromEntries(
  Object.entries(runtimeEnv).filter(
    ([key]) =>
      !/SUPABASE|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|ASSET_GATEWAY/i.test(key),
  ),
);
run(
  path.resolve("node_modules/tsx/dist/cli.mjs"),
  [
    "watch",
    local ? "--env-file=.local/supabase.env" : "--env-file-if-exists=.env",
    "apps/api/src/server.ts",
  ],
  runtimeEnv,
);
for (const app of ["web", "admin"])
  run(
    path.resolve("node_modules/vite/bin/vite.js"),
    [
      "--config",
      `apps/${app}/vite.config.ts`,
      ...(local ? ["--port", app === "web" ? "5176" : "5177"] : []),
    ],
    frontendEnv,
  );
