import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { handleRequest } from "../apps/api/src/handler.ts";

const request = (path: string, body: unknown, token?: string) =>
  new Request(`http://localhost/api/v1/account/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
test("recovery fails closed without a trusted redirect or a verified session", async () => {
  const env = {
    SUPABASE_URL: "https://example.invalid",
    SUPABASE_SECRET_KEY: "test-only",
  };
  assert.equal(
    (
      await handleRequest(
        request("recover", { email: "user@example.invalid" }),
        env,
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await handleRequest(
        request("recover", {
          email: "user@example.invalid",
          redirectTo: "https://untrusted.invalid",
        }),
        env,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handleRequest(
        request("recover", { email: "user@example.invalid" }),
        { ...env, ACCOUNT_RECOVERY_URL: "http://untrusted.invalid/" },
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await handleRequest(
        request("password", {
          password: "test-only-new-password",
          refreshToken: "test-only",
        }),
        env,
      )
    ).status,
    401,
  );
});
test("recovery uses the configured redirect and updates only the verified user session", async () => {
  const calls: {
    path: string;
    body: Record<string, unknown>;
    authorization?: string;
  }[] = [];
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    email_confirmed_at: "2026-01-01T00:00:00Z",
  };
  const token =
    [
      { alg: "HS256", typ: "JWT" },
      { exp: Math.floor(Date.now() / 1000) + 3600, sub: user.id },
    ]
      .map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"))
      .join(".") + ".test-only-signature";
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    calls.push({
      path: req.url ?? "",
      body: text ? JSON.parse(text) : {},
      authorization: req.headers.authorization,
    });
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization === "Bearer invalid-session") {
      res.statusCode = 401;
      res.end(JSON.stringify({ message: "invalid token" }));
      return;
    }
    if (req.url?.startsWith("/auth/v1/recover")) {
      res.end("{}");
      return;
    }
    if (req.url === "/auth/v1/user") {
      res.end(JSON.stringify(user));
      return;
    }
    if (req.url?.startsWith("/auth/v1/logout")) {
      res.statusCode = 204;
      res.end();
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
    ACCOUNT_RECOVERY_URL: "http://127.0.0.1:5175/?recovery=1",
  };
  try {
    const recovery = await handleRequest(
      request("recover", { email: "user@example.invalid" }),
      env,
    );
    assert.equal(recovery.status, 200);
    assert.ok(
      calls[0].path.includes(encodeURIComponent(env.ACCOUNT_RECOVERY_URL)),
    );
    const bad = await handleRequest(
      request(
        "password",
        { password: "test-only-new-password", refreshToken: "test-only" },
        "invalid-session",
      ),
      env,
    );
    assert.equal(bad.status, 401);
    const result = await handleRequest(
      request(
        "password",
        { password: "test-only-new-password", refreshToken: "test-only" },
        token,
      ),
      env,
    );
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), {
      passwordUpdated: true,
      sessionsRevoked: true,
    });
    const writes = calls.filter((call) => "password" in call.body);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].authorization, `Bearer ${token}`);
    assert.deepEqual(writes[0].body, {
      password: "test-only-new-password",
      code_challenge: null,
      code_challenge_method: null,
    });
    assert.ok(
      calls.some((call) => call.path === "/auth/v1/logout?scope=global"),
    );
    assert.ok(!calls.some((call) => call.path.includes("/admin/")));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
