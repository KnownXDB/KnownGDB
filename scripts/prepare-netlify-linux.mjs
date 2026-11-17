import { createHash, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const temporary = mkdtempSync(path.join(tmpdir(), "knowngdb-linux-deps-"));
for (const name of ["@img/sharp-linux-x64", "@img/sharp-libvips-linux-x64"]) {
  const entry = lock.packages[`node_modules/${name}`];
  if (!entry || !entry.integrity?.startsWith("sha512-"))
    throw Error(`Missing pinned integrity for ${name}.`);
  const url = new URL(entry.resolved);
  if (url.protocol !== "https:" || url.hostname !== "registry.npmjs.org")
    throw Error(`Unexpected package registry for ${name}.`);
  const response = await fetch(url);
  if (!response.ok) throw Error(`Could not download ${name}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha512").update(bytes).digest();
  const expected = Buffer.from(
    entry.integrity.slice("sha512-".length),
    "base64",
  );
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw Error(`Integrity check failed for ${name}.`);
  const archive = path.join(temporary, `${name.split("/")[1]}.tgz`);
  writeFileSync(archive, bytes);
  const destination = path.resolve("node_modules", name);
  mkdirSync(destination, { recursive: true });
  execFileSync("tar", [
    "-xzf",
    archive,
    "-C",
    destination,
    "--strip-components=1",
  ]);
  console.log(
    `Prepared ${name}@${entry.version} (verified against package-lock.json).`,
  );
}
