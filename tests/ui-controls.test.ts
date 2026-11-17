import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".tsx")
        ? [path]
        : [];
  });
}
test("interface forms use shared feedback and custom menus", () => {
  for (const file of [
    ...sourceFiles("apps"),
    ...sourceFiles("packages/ui/src"),
  ]) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(
      text,
      /window\.(?:alert|confirm|prompt)\s*\(|\.reportValidity\s*\(|beforeunload/,
      file,
    );
    assert.doesNotMatch(
      text,
      /type=["'](?:date|time|datetime-local)["']/,
      file,
    );
    if (!file.replaceAll("\\", "/").endsWith("/controls.tsx"))
      assert.doesNotMatch(text, /<select(?:\s|>)/, file);
  }
});
