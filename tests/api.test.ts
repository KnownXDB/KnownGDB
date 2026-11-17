import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { handleRequest } from "../apps/api/src/handler.ts";
import { issueSession } from "../apps/api/src/session.ts";
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
test("Steam official preview requires an active administrative session", async () => {
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/admin/store/steam/preview", {
          method: "POST",
        }),
        {},
      )
    ).status,
    503,
  );
  const response = await handleRequest(
    new Request("http://localhost/api/v1/admin/store/steam/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "123456" }),
    }),
    {
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SECRET_KEY: "not-a-credential",
    },
  );
  assert.equal(response.status, 401);
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/admin/store/steam/confirm", {
          method: "POST",
        }),
        {},
      )
    ).status,
    503,
  );
});
test("store observation routes restore the HttpOnly admin session", async () => {
  const env = {
    SESSION_SECRET: randomBytes(32).toString("base64url"),
    SUPABASE_URL: "https://example.invalid",
    SUPABASE_SECRET_KEY: "not-a-credential",
  };
  const cookie = issueSession(
    new Request("http://localhost/api/v1/admin/store/steam/preview"),
    env,
    {
      access_token: "test-only-access",
      refresh_token: "test-only-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "2026-01-01T00:00:00Z",
        email_confirmed_at: "2026-01-01T00:00:00Z",
      },
    },
    Response.json({}),
  )
    .headers.get("set-cookie")!
    .split(";")[0];
  const response = await handleRequest(
    new Request("http://localhost/api/v1/admin/store/steam/preview", {
      method: "POST",
      headers: {
        cookie,
        "Content-Type": "application/json",
        origin: "http://localhost",
      },
      body: JSON.stringify({ appId: "730" }),
    }),
    env,
  );
  assert.equal(response.status, 503);
});
test("Xbox official preview requires an active administrative session", async () => {
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/admin/store/xbox/preview", {
          method: "POST",
        }),
        {},
      )
    ).status,
    503,
  );
  const response = await handleRequest(
    new Request("http://localhost/api/v1/admin/store/xbox/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: "9NV0ZMV5GB11" }),
    }),
    {
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SECRET_KEY: "not-a-credential",
    },
  );
  assert.equal(response.status, 401);
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/admin/store/xbox/confirm", {
          method: "POST",
        }),
        {},
      )
    ).status,
    503,
  );
});
test("Epic official preview requires an active administrative session", async () => {
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/admin/store/epic/preview", {
          method: "POST",
        }),
        {},
      )
    ).status,
    503,
  );
  const response = await handleRequest(
    new Request("http://localhost/api/v1/admin/store/epic/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "fixture-game" }),
    }),
    {
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SECRET_KEY: "not-a-credential",
    },
  );
  assert.equal(response.status, 401);
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/admin/store/epic/confirm", {
          method: "POST",
        }),
        {},
      )
    ).status,
    503,
  );
});
test("EA official preview requires an active administrative session", async () => {
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/admin/store/ea/preview", {
          method: "POST",
        }),
        {},
      )
    ).status,
    503,
  );
  const response = await handleRequest(
    new Request("http://localhost/api/v1/admin/store/ea/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesSlug: "ea-sports-fc", gameSlug: "fc-27" }),
    }),
    {
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SECRET_KEY: "not-a-credential",
    },
  );
  assert.equal(response.status, 401);
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/admin/store/ea/confirm", {
          method: "POST",
        }),
        {},
      )
    ).status,
    503,
  );
});
test("Ubisoft official preview requires an active administrative session", async () => {
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/admin/store/ubisoft/preview", {
          method: "POST",
        }),
        {},
      )
    ).status,
    503,
  );
  const response = await handleRequest(
    new Request("http://localhost/api/v1/admin/store/ubisoft/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeSlug: "far-cry-6" }),
    }),
    {
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SECRET_KEY: "not-a-credential",
    },
  );
  assert.equal(response.status, 401);
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/admin/store/ubisoft/confirm", {
          method: "POST",
        }),
        {},
      )
    ).status,
    503,
  );
});
test("PlayStation official preview requires an active administrative session", async () => {
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/admin/store/playstation/preview", {
          method: "POST",
        }),
        {},
      )
    ).status,
    503,
  );
  const response = await handleRequest(
    new Request("http://localhost/api/v1/admin/store/playstation/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageKind: "concept",
        identifier: "10000333",
      }),
    }),
    {
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SECRET_KEY: "not-a-credential",
    },
  );
  assert.equal(response.status, 401);
  assert.equal(
    (
      await handleRequest(
        new Request("http://localhost/api/v1/admin/store/playstation/confirm", {
          method: "POST",
        }),
        {},
      )
    ).status,
    503,
  );
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
