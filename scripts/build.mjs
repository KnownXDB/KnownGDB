import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
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
mkdirSync("dist/site", { recursive: true });
cpSync("apps/web/dist", "dist/site", { recursive: true });
cpSync("apps/admin/dist", "dist/site/admin", { recursive: true });
