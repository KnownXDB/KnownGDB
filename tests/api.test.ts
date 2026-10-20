import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../apps/api/src/handler.ts";
test("health works without hosted credentials and domain reads fail closed", async () => {
  const response = await handleRequest(
    new Request("http://localhost/api/v1/health"),
    {},
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).catalogConfigured, false);
  assert.equal(
    (await handleRequest(new Request("http://localhost/api/v1/games"), {}))
      .status,
    503,
  );
});
test("administration does not expose data without configured authentication", async () => {
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/admin/session"),
        {},
      )
    ).status,
    503,
  );
  const response = await handleRequest(
    new Request("http://localhost/api/v1/admin/session"),
    {
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SECRET_KEY: "not-a-credential",
    },
  );
  assert.equal(response.status, 401);
});
test("unknown routes and writes are explicitly rejected", async () => {
  assert.equal(
    (await handleRequest(new Request("http://localhost/api/unknown"), {}))
      .status,
    404,
  );
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/games", { method: "POST" }),
        {},
      )
    ).status,
    405,
  );
});
