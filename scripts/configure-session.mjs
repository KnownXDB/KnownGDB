import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

// Fail closed if this private environment file could enter version control.
execFileSync("git", ["check-ignore", "--quiet", ".env"]);
const tracked = execFileSync("git", ["ls-files", "--", ".env"], {
  encoding: "utf8",
});
if (tracked.trim())
  throw Error("Refusing to configure a tracked environment file.");
const existing = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
if (/^SESSION_SECRET=.+$/m.test(existing)) {
  console.log("Session secret already configured; no changes made.");
} else {
  const entry = `SESSION_SECRET=${randomBytes(32).toString("base64url")}`;
  fs.writeFileSync(
    ".env",
    /^SESSION_SECRET=.*$/m.test(existing)
      ? existing.replace(/^SESSION_SECRET=.*$/m, entry)
      : `${existing.replace(/\n?$/, "\n")}${entry}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  console.log(
    "Private session secret configured. Restart the API; the value was not displayed.",
  );
}
