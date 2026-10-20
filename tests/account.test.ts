import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { handleRequest } from "../apps/api/src/handler.ts";

const request = (path: string, body?: unknown, token?: string) =>
  new Request(`http://localhost/api/v1/account/${path}`, {
    method: body === undefined ? "GET" : path === "profile" ? "PUT" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
test("account writes reject cross-origin, malformed and unauthenticated input", async () => {
  const env = {
    SUPABASE_URL: "https://example.invalid",
    SUPABASE_SECRET_KEY: "test-only",
  };
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/account/login", {
          method: "POST",
          headers: {
            Origin: "https://untrusted.invalid",
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/account/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
        env,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handleRequest(
        request("login", { email: "invalid", password: "short" }),
        env,
      )
    ).status,
    400,
  );
  assert.equal(
    (await handleRequest(request("profile", { displayName: "Name" }), env))
      .status,
    401,
  );
  assert.equal((await handleRequest(request("profile"), env)).status, 401);
});
test("profile ownership comes only from verified identity and rejects mass assignment", async () => {
  const writes: unknown[] = [];
  const id = "00000000-0000-4000-8000-000000000001";
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/auth/v1/user") {
      res.end(
        JSON.stringify({ id, email_confirmed_at: "2026-01-01T00:00:00Z" }),
      );
      return;
    }
    if (
      req.url?.startsWith("/rest/v1/contributor_profiles") &&
      req.method === "POST"
    ) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      writes.push(JSON.parse(Buffer.concat(chunks).toString()));
      res.end(JSON.stringify({ display_name: "Contributor" }));
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
  try {
    const rejected = await handleRequest(
      request(
        "profile",
        {
          displayName: "Contributor",
          user_id: "another-user",
          role: "super_admin",
        },
        "test-token",
      ),
      env,
    );
    assert.equal(rejected.status, 400);
    assert.equal(writes.length, 0);
    assert.equal(
      (
        await handleRequest(
          request("profile", { displayName: "<script>" }, "test-token"),
          env,
        )
      ).status,
      400,
    );
    const accepted = await handleRequest(
      request("profile", { displayName: " Contributor " }, "test-token"),
      env,
    );
    assert.equal(accepted.status, 200);
    assert.deepEqual(writes, [{ user_id: id, display_name: "Contributor" }]);
    assert.deepEqual(await accepted.json(), {
      profile: { displayName: "Contributor" },
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
