import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { handleRequest } from "../apps/api/src/handler.ts";
test("text transfer validates chunks and sends bytes only after credential framing", async () => {
  let calls = 0;
  let authorizations = 0;
  let result = "allowed";
  let received: Record<string, unknown> = {};
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    res.setHeader("Content-Type", "application/json");
    if (req.url?.endsWith("/consume_integration_credential")) {
      authorizations++;
      return res.end(JSON.stringify(result));
    }
    calls++;
    received = JSON.parse(raw);
    res.end(JSON.stringify({ status: "stored" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const env = {
      SUPABASE_URL: `http://127.0.0.1:${address.port}`,
      SUPABASE_SECRET_KEY: "fixture-only",
    };
    const id = "00000000-0000-4000-8000-000000000003";
    const bytes = Buffer.from(" fixture ñ ");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const request = (body: unknown, auth = `Bearer kgsvc_${"a".repeat(43)}`) =>
      new Request("http://localhost/api/v1/integrations/text-transfer", {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    let response = await handleRequest(
      request({
        action: "chunk",
        id,
        index: 0,
        data: bytes.toString("base64"),
        sha256: digest,
      }),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(received.p_data, `\\x${bytes.toString("hex")}`);
    assert.notEqual(received.p_hash, `kgsvc_${"a".repeat(43)}`);
    assert.equal(calls, 1);
    response = await handleRequest(
      request({
        action: "chunk",
        id,
        index: 0,
        data: bytes.toString("base64"),
        sha256: "0".repeat(64),
      }),
      env,
    );
    assert.equal(response.status, 400);
    assert.equal(calls, 1);
    assert.equal(authorizations, 2);
    result = "limited";
    response = await handleRequest(request({ action: "complete", id }), env);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "60");
    response = await handleRequest(
      request({ action: "complete", id }, "Bearer kgdb_invalid"),
      env,
    );
    assert.equal(response.status, 401);
    assert.equal(calls, 1);
    assert.equal(authorizations, 3);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("text transfer credentials require explicit scope and return a secret only at creation", async () => {
  const actor = "00000000-0000-4000-8000-000000000001",
    session = "00000000-0000-4000-8000-000000000002";
  const token = `fixture.${Buffer.from(JSON.stringify({ session_id: session })).toString("base64url")}.fixture`;
  let scopeCall = "";
  let payload: Record<string, unknown> = {};
  const server = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname;
    res.setHeader("Content-Type", "application/json");
    if (path === "/auth/v1/user")
      return res.end(
        JSON.stringify({
          id: actor,
          email_confirmed_at: "2026-01-01T00:00:00Z",
        }),
      );
    if (path.endsWith("/admin_members"))
      return res.end(JSON.stringify([{ role: "super_admin" }]));
    if (path.endsWith("/admin_check")) return res.end("true");
    if (
      path.endsWith("/create_text_transfer_credential") ||
      path.endsWith("/create_multi_scope_credential")
    ) {
      scopeCall = path;
      let raw = "";
      for await (const chunk of req) raw += chunk;
      payload = JSON.parse(raw);
      return res.end(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000003",
          scope: "intake:text",
        }),
      );
    }
    res.statusCode = 404;
    res.end("{}");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const env = {
      SUPABASE_URL: `http://127.0.0.1:${address.port}`,
      SUPABASE_SECRET_KEY: "fixture-only",
    };
    const request = new Request(
      "http://localhost/api/v1/admin/integration-credentials",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Fixture",
          scope: "intake:text",
          expiresAt: "2099-01-01T00:00:00.000Z",
          reason: "Fixture",
        }),
      },
    );
    const response = await handleRequest(request, env);
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.match(body.key, /^kgsvc_[A-Za-z0-9_-]{43}$/);
    assert.equal(body.scope, "intake:text");
    assert.ok(scopeCall.endsWith("/create_text_transfer_credential"));
    assert.equal(
      payload.p_hash,
      createHash("sha256").update(body.key).digest("hex"),
    );
    assert.notEqual(payload.p_hash, body.key);
    assert.equal(payload.p_prefix, body.key.slice(0, 13));
    const combined = await handleRequest(
      new Request("http://localhost/api/v1/admin/integration-credentials", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Combined",
          scopes: ["identity:resolve", "intake:text"],
          expiresAt: null,
          reason: "Fixture",
        }),
      }),
      env,
    );
    assert.equal(combined.status, 201);
    assert.ok(scopeCall.endsWith("/create_multi_scope_credential"));
    for (const scopes of [
      [],
      ["identity:resolve", "identity:resolve"],
      ["identity:resolve", "unknown"],
    ]) {
      const rejected = await handleRequest(
        new Request("http://localhost/api/v1/admin/integration-credentials", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Origin: "http://localhost",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Invalid",
            scopes,
            expiresAt: null,
            reason: "Fixture",
          }),
        }),
        env,
      );
      assert.equal(rejected.status, 400);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
