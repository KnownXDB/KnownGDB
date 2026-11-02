import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { handleRequest } from "../apps/api/src/handler.ts";
import { hashApiKey } from "../apps/api/src/api-keys.ts";

test("consumption keys are hashed, enforced and isolated from account permissions", async () => {
  let valid = true;
  let received: unknown;
  const secret = `kgdb_${"a".repeat(43)}`;
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/rest/v1/rpc/consume_catalog_api_key") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      received = JSON.parse(Buffer.concat(chunks).toString());
      res.end(JSON.stringify(valid));
    } else if (req.url?.startsWith("/rest/v1/game_localizations"))
      res.end("[]");
    else {
      res.statusCode = 401;
      res.end('{"message":"Invalid credentials"}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const env = {
    SUPABASE_URL: `http://127.0.0.1:${address.port}`,
    SUPABASE_SECRET_KEY: "test-only",
  };
  const request = (key?: string, path = "/api/v1/consumer/games") =>
    new Request(`http://localhost${path}`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
  try {
    assert.equal((await handleRequest(request(), env)).status, 401);
    const response = await handleRequest(request(secret), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { games: [] });
    assert.deepEqual(received, { p_hash: hashApiKey(secret) });
    valid = false;
    assert.equal((await handleRequest(request(secret), env)).status, 401);
    assert.equal(
      (await handleRequest(request(secret, "/api/v1/account/api-keys"), env))
        .status,
      401,
    );
    assert.equal(
      (
        await handleRequest(
          new Request("http://example.invalid/api/v1/consumer/games"),
          env,
        )
      ).status,
      403,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
