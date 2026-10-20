import { spawn } from "node:child_process";
import path from "node:path";
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
  Object.entries(process.env).filter(
    ([key]) =>
      !/SUPABASE|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|ASSET_GATEWAY/i.test(key),
  ),
);
run(
  path.resolve("node_modules/tsx/dist/cli.mjs"),
  ["watch", "--env-file-if-exists=.env", "apps/api/src/server.ts"],
  process.env,
);
for (const app of ["web", "admin"])
  run(
    path.resolve("node_modules/vite/bin/vite.js"),
    ["--config", `apps/${app}/vite.config.ts`],
    frontendEnv,
  );
