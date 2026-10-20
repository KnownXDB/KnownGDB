import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";

// Only inspect the local CLI stack; never read or overwrite the hosted .env.
const result = spawnSync(
  process.execPath,
  ["node_modules/supabase/dist/supabase.js", "status", "-o", "json"],
  { encoding: "utf8" },
);
let status;
try {
  status = JSON.parse(result.stdout);
} catch {
  throw Error(
    "Local status is unavailable. Start the local Supabase stack first.",
  );
}
const apiUrl = status.API_URL;
const secret = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
if (
  result.status !== 0 ||
  apiUrl !== "http://127.0.0.1:54321" ||
  typeof secret !== "string" ||
  !secret
)
  throw Error(
    "A running Supabase stack at the expected local URL is required.",
  );
const file = ".local/supabase.env";
execFileSync("git", ["check-ignore", "--quiet", file]);
if (execFileSync("git", ["ls-files", "--", file], { encoding: "utf8" }).trim())
  throw Error("Refusing to write a tracked environment file.");
fs.mkdirSync(".local", { recursive: true });
if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())
  throw Error("Refusing to overwrite a linked environment file.");
const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const sessionSecret =
  existing.match(/^SESSION_SECRET=([A-Za-z0-9_-]{43})$/m)?.[1] ??
  randomBytes(32).toString("base64url");
fs.writeFileSync(
  file,
  `SUPABASE_URL=${apiUrl}\nSUPABASE_SECRET_KEY=${secret}\nSESSION_SECRET=${sessionSecret}\nAPI_PORT=8788\nACCOUNT_RECOVERY_URL=http://127.0.0.1:5176/?recovery=1\n`,
  { encoding: "utf8", mode: 0o600 },
);
console.log(
  "Ignored local API configuration written without displaying credentials. The root .env is unchanged.",
);
console.log("Run npm run dev:local: web 5176, admin 5177 and API 8788.");
