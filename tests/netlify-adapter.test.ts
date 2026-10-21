import assert from "node:assert/strict";
import test from "node:test";
import adapter, { config } from "../netlify/functions/api.mts";

test("Netlify ESM adapter preserves API routes and request authorization", async () => {
  assert.equal(config.path, "/api/v1/*");
  const health = await adapter(
    new Request("https://example.test/api/v1/health"),
  );
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, "KnownGDB API");
  const rejected = await adapter(
    new Request("https://example.test/api/v1/admin/asset-versions", {
      method: "POST",
      headers: { Origin: "https://untrusted.test" },
    }),
  );
  assert.equal(rejected.status, 403);
});
