import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, realpathSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
const siteOutput = path.resolve("dist/site");
const workspaceRoot = realpathSync(".");
if (
  existsSync(siteOutput) &&
  !realpathSync(siteOutput).startsWith(workspaceRoot + path.sep)
)
  throw Error("Site output must remain inside the workspace.");
for (const app of ["web", "admin"])
  execFileSync(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "build",
      "--config",
      `apps/${app}/vite.config.ts`,
    ],
    { stdio: "inherit" },
  );
rmSync(siteOutput, { recursive: true, force: true });
mkdirSync(siteOutput, { recursive: true });
cpSync("apps/web/dist", "dist/site", { recursive: true });
cpSync("apps/admin/dist", "dist/site/admin", { recursive: true });
await build({
  entryPoints: ["netlify/functions/api.mts"],
  outfile: "dist/functions/api.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: 'import { createRequire as createNodeRequire } from "node:module"; const require = createNodeRequire(import.meta.url);',
  },
});
