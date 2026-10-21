import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, searchForWorkspaceRoot } from "vite";

for (const app of ["web", "admin"]) {
  test(`${app} denies private files while serving allowed source files`, async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), "knowngdb-boundary-"));
    await mkdir(path.join(fixture, ".local"));
    await writeFile(
      path.join(fixture, ".local", "probe.txt"),
      "private marker",
    );
    await writeFile(path.join(fixture, "allowed.txt"), "public marker");
    const server = await createServer({
      configFile: path.resolve(`apps/${app}/vite.config.ts`),
      logLevel: "silent",
      server: {
        port: 0,
        strictPort: false,
        fs: { allow: [searchForWorkspaceRoot(process.cwd()), fixture] },
      },
    });
    try {
      await server.listen();
      const address = server.httpServer!.address();
      assert.ok(address && typeof address !== "string");
      const base = `http://127.0.0.1:${address.port}${app === "admin" ? "/admin" : ""}/@fs/`;
      const allowed = await fetch(
        base + path.join(fixture, "allowed.txt").replaceAll("\\", "/"),
      );
      assert.equal(allowed.status, 200);
      assert.equal(await allowed.text(), "public marker");
      const denied = await fetch(
        base + path.join(fixture, ".local", "probe.txt").replaceAll("\\", "/"),
      );
      assert.equal(denied.status, 403);
      assert.ok(!(await denied.text()).includes("private marker"));
    } finally {
      await server.close();
      await rm(fixture, { recursive: true, force: true });
    }
  });
}
