import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { handleRequest } from "../apps/api/src/handler.ts";
import { hashApiKey, validKeyExpiration } from "../apps/api/src/api-keys.ts";

test("key expiration permits indefinite lifetime and future dates only", () => {
  assert.equal(validKeyExpiration(null), true);
  assert.equal(
    validKeyExpiration(new Date(Date.now() + 86400000).toISOString()),
    true,
  );
  for (const value of [
    undefined,
    90,
    "never",
    "2020-01-01T00:00:00.000Z",
    "2099-02-31T00:00:00.000Z",
  ])
    assert.equal(validKeyExpiration(value), false);
});

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
      res.end(
        JSON.stringify([
          {
            game_id: "00000000-0000-4000-8000-000000000001",
            title: "Fixture demo",
            language: "en",
            games: { status: "published", item_type: "demo" },
          },
          {
            game_id: "00000000-0000-4000-8000-000000000002",
            title: "Fixture expansion",
            language: "en",
            games: [{ status: "published", item_type: "expansion" }],
          },
        ]),
      );
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
    assert.deepEqual(await response.json(), {
      games: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          title: "Fixture demo",
          language: "en",
          itemType: "demo",
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          title: "Fixture expansion",
          language: "en",
          itemType: "expansion",
        },
      ],
    });
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

test("key management validates requests and derives the account owner", async () => {
  const actor = "00000000-0000-4000-8000-000000000001";
  const sessionId = "00000000-0000-4000-8000-000000000002";
  const keyId = "00000000-0000-4000-8000-000000000003";
  const token = `x.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString("base64url")}.x`;
  const calls: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/auth/v1/user") {
      res.end(
        JSON.stringify({
          id: actor,
          email_confirmed_at: "2026-01-01T00:00:00Z",
        }),
      );
      return;
    }
    if (req.url === "/rest/v1/rpc/account_api_keys") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      calls.push(JSON.parse(Buffer.concat(chunks).toString()));
      res.end(
        JSON.stringify(
          calls.at(-1)?.p_action === "PURGE"
            ? { deleted: true }
            : { updated: true },
        ),
      );
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const env = {
    SUPABASE_URL: `http://127.0.0.1:${address.port}`,
    SUPABASE_SECRET_KEY: "test-only",
  };
  const request = (method: string, body: object) =>
    new Request("http://localhost/api/v1/account/api-keys", {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (
        await handleRequest(
          request("PATCH", { id: keyId, name: " Renamed " }),
          env,
        )
      ).status,
      200,
    );
    assert.equal(calls[0].p_action, "RENAME");
    assert.equal(calls[0].p_name, "Renamed");
    assert.equal(calls[0].p_actor, actor);
    assert.equal(calls[0].p_session, sessionId);
    assert.equal(
      (
        await handleRequest(
          request("DELETE", { id: keyId, permanent: true }),
          env,
        )
      ).status,
      200,
    );
    assert.equal(calls[1].p_action, "PURGE");
    assert.equal(
      (await handleRequest(request("DELETE", { id: keyId }), env)).status,
      200,
    );
    assert.equal(calls[2].p_action, "DELETE");
    for (const [method, body] of [
      ["PATCH", { id: keyId, name: "<bad>" }],
      ["PATCH", { id: keyId, name: "New", expiresAt: null }],
      ["DELETE", { id: keyId, permanent: false }],
      ["DELETE", { id: keyId, actor: "other" }],
    ] as const)
      assert.equal(
        (await handleRequest(request(method, body), env)).status,
        400,
      );
    assert.equal(calls.length, 3);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
