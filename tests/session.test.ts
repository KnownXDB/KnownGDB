import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { Session } from "@supabase/supabase-js";
import { handleRequest } from "../apps/api/src/handler.ts";
import { issueSession } from "../apps/api/src/session.ts";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email_confirmed_at: "2026-01-01T00:00:00Z",
};
const session = (expiresAt = Math.floor(Date.now() / 1000) + 3600) =>
  ({
    access_token: "test-only-access",
    refresh_token: "test-only-refresh",
    expires_at: expiresAt,
    expires_in: 3600,
    token_type: "bearer",
    user,
  }) as Session;
const getCookie = (response: Response) => {
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";")[0];
};
test("cookies are authenticated, encrypted, host-only and bounded by absolute expiry", async () => {
  assert.equal(
    (
      await handleRequest(
        new Request("http://example.invalid/api/v1/account/session"),
        {},
      )
    ).status,
    403,
  );
  const env = { SESSION_SECRET: randomBytes(32).toString("base64url") };
  const request = new Request("https://example.invalid/api/v1/account/session");
  const response = issueSession(
    request,
    env,
    session(),
    Response.json({ authenticated: true }),
  );
  const header = response.headers.get("set-cookie")!;
  assert.match(header, /^__Host-knowngdb-session=/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  assert.match(header, /; Secure/);
  assert.ok(!header.includes("Domain="));
  assert.ok(!header.includes("test-only-access"));
  assert.ok(!header.includes("test-only-refresh"));
  const cookie = getCookie(response);
  const tampered = cookie.slice(0, -8) + "AAAAAAAA";
  for (const value of [tampered, `${cookie}; ${cookie}`]) {
    const result = await handleRequest(
      new Request(request.url, { headers: { cookie: value } }),
      env,
    );
    assert.equal(result.status, 401);
    assert.match(result.headers.get("set-cookie")!, /Max-Age=0/);
  }
  const expired = getCookie(
    issueSession(
      request,
      env,
      session(),
      Response.json({}),
      Math.floor(Date.now() / 1000) - 1,
    ),
  );
  assert.equal(
    (
      await handleRequest(
        new Request(request.url, { headers: { cookie: expired } }),
        env,
      )
    ).status,
    401,
  );
});
test("cookie sessions restore, refresh, enforce CSRF and clear on sign-out", async () => {
  let refreshCount = 0;
  let identityChecks = 0;
  let unavailableIdentity = false;
  let logoutCount = 0;
  let rejectRefresh = false;
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url?.startsWith("/auth/v1/token?grant_type=refresh_token")) {
      refreshCount++;
      if (rejectRefresh) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            message: "Invalid refresh token",
            error_code: "refresh_token_not_found",
          }),
        );
        return;
      }
      res.end(JSON.stringify(session()));
      return;
    }
    if (req.url?.startsWith("/auth/v1/token?grant_type=password")) {
      res.end(JSON.stringify(session()));
      return;
    }
    if (req.url === "/auth/v1/user") {
      identityChecks++;
      if (unavailableIdentity) {
        res.statusCode = 503;
        res.end(JSON.stringify({ message: "Temporarily unavailable" }));
        return;
      }
      res.end(JSON.stringify(user));
      return;
    }
    if (req.url?.startsWith("/auth/v1/logout")) {
      logoutCount++;
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.url?.startsWith("/rest/v1/admin_members")) {
      res.end(JSON.stringify({ role: "super_admin" }));
      return;
    }
    if (req.url?.startsWith("/rest/v1/contributor_profiles")) {
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
    SESSION_SECRET: randomBytes(32).toString("base64url"),
    SUPABASE_URL: `http://127.0.0.1:${address.port}`,
    SUPABASE_SECRET_KEY: "test-only",
  };
  const url = "http://localhost/api/v1/account/";
  try {
    const login = await handleRequest(
      new Request(url + "login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          email: "test@example.invalid",
          password: "test-only-password",
        }),
      }),
      env,
    );
    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), { authenticated: true });
    const cookie = getCookie(login);
    assert.match(cookie, /^knowngdb-local-session=/);
    const restored = await handleRequest(
      new Request(url + "session", { headers: { cookie } }),
      env,
    );
    assert.equal(restored.status, 200);
    assert.equal(identityChecks, 1);
    assert.deepEqual(await restored.json(), {
      authenticated: true,
      profile: { displayName: "Contributor" },
      role: "super_admin",
    });
    assert.equal(refreshCount, 0);
    unavailableIdentity = true;
    const temporary = await handleRequest(
      new Request(url + "session", { headers: { cookie } }),
      env,
    );
    assert.equal(temporary.status, 503);
    assert.equal(temporary.headers.has("set-cookie"), false);
    unavailableIdentity = false;
    assert.equal(
      (
        await handleRequest(
          new Request("http://localhost/api/v1/admin/session", {
            headers: { cookie },
          }),
          env,
        )
      ).status,
      200,
    );
    for (const origin of [undefined, "https://untrusted.invalid"]) {
      const result = await handleRequest(
        new Request(url + "logout", {
          method: "POST",
          headers: {
            cookie,
            "Content-Type": "application/json",
            ...(origin ? { origin } : {}),
          },
          body: "{}",
        }),
        env,
      );
      assert.equal(result.status, 403);
    }
    assert.equal(logoutCount, 0);
    assert.equal(
      (
        await handleRequest(
          new Request(url + "session", {
            headers: { cookie, "sec-fetch-site": "cross-site" },
          }),
          env,
        )
      ).status,
      403,
    );
    const oldCookie = getCookie(
      issueSession(
        new Request(url + "session"),
        env,
        session(Math.floor(Date.now() / 1000) - 1),
        Response.json({}),
      ),
    );
    const refreshed = await handleRequest(
      new Request(url + "session", { headers: { cookie: oldCookie } }),
      env,
    );
    assert.equal(refreshed.status, 200);
    assert.equal(refreshCount, 1);
    assert.ok(refreshed.headers.has("set-cookie"));
    rejectRefresh = true;
    const invalid = await handleRequest(
      new Request(url + "session", { headers: { cookie: oldCookie } }),
      env,
    );
    assert.equal(invalid.status, 401);
    assert.match(invalid.headers.get("set-cookie")!, /Max-Age=0/);
    const logout = await handleRequest(
      new Request(url + "logout", {
        method: "POST",
        headers: {
          cookie,
          "Content-Type": "application/json",
          origin: "http://localhost",
        },
        body: "{}",
      }),
      env,
    );
    assert.equal(logout.status, 200);
    assert.equal(logoutCount, 1);
    assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
    assert.equal(
      (await handleRequest(new Request(url + "session"), env)).status,
      401,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
