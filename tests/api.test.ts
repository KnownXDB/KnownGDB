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
