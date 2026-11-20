import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyCandidates,
  parseIdentities,
} from "../apps/api/src/identity-resolution.ts";

test("identity resolution treats conflicting or uncertain evidence conservatively", () => {
  const row = (game_id: string, evidence_status: string) => ({
    game_id,
    evidence_status,
  });
  assert.equal(classifyCandidates([], false).status, "not_found");
  assert.equal(classifyCandidates([row("a", "verified")], false).gameId, "a");
  assert.equal(
    classifyCandidates([row("a", "verified"), row("b", "verified")], false)
      .status,
    "conflict",
  );
  assert.equal(
    classifyCandidates([row("a", "observed")], false).status,
    "review",
  );
  assert.equal(
    classifyCandidates([row("a", "conflicted")], false).status,
    "conflict",
  );
  assert.equal(
    classifyCandidates([row("a", "verified")], true).status,
    "conflict",
  );
});
test("identity input is bounded and normalized", () => {
  const identity = {
    provider: "example",
    namespace: "games",
    kind: "id",
    value: "  ABC  ",
  };
  assert.equal(parseIdentities({ identities: [identity] })?.[0].value, "abc");
  assert.equal(parseIdentities({ identities: Array(21).fill(identity) }), null);
  assert.equal(
    parseIdentities({ identities: [{ ...identity, provider: "bad!" }] }),
    null,
  );
});
import { handleRequest } from "../apps/api/src/handler.ts";
test("identity endpoint refuses unconfigured and insecure access", async () => {
  const path = "/api/v1/admin/identities/resolve";
  const local = await handleRequest(
    new Request(`http://localhost${path}`, { method: "POST" }),
    {},
  );
  assert.equal(local.status, 503);
  const remote = await handleRequest(
    new Request(`http://example.invalid${path}`, { method: "POST" }),
    {},
  );
  assert.equal(remote.status, 403);
});

import { createServer } from "node:http";
import { once } from "node:events";
test("authenticated lookup preserves provider and kind for official store identifiers", async () => {
  const actor = "00000000-0000-4000-8000-000000000001";
  const session = "00000000-0000-4000-8000-000000000002";
  const game = "00000000-0000-4000-8000-000000000003";
  const token = `fixture.${Buffer.from(JSON.stringify({ session_id: session })).toString("base64url")}.fixture`;
  const queries: string[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/auth/v1/user")
      return res.end(
        JSON.stringify({
          id: actor,
          email_confirmed_at: "2026-01-01T00:00:00Z",
        }),
      );
    if (url.pathname.endsWith("/admin_members"))
      return res.end(JSON.stringify([{ role: "super_admin" }]));
    if (url.pathname.endsWith("/admin_check")) return res.end("true");
    if (url.pathname.endsWith("/external_identities")) {
      queries.push(url.search);
      return res.end(
        JSON.stringify([
          {
            game_id: game,
            evidence_status: "verified",
            valid_from: null,
            valid_until: null,
          },
        ]),
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
    const identities = ["steam", "epic", "xbox", "gog", "ea", "ubisoft"].map(
      (provider) => ({
        provider,
        namespace: `${provider}.product`,
        kind: "product_id",
        value: "12345",
      }),
    );
    const request = new Request(
      "http://localhost/api/v1/admin/identities/resolve",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identities }),
      },
    );
    const result = await handleRequest(request, {
      SUPABASE_URL: `http://127.0.0.1:${address.port}`,
      SUPABASE_SECRET_KEY: "fixture-only",
    });
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.deepEqual(
      body.results.map((entry: { gameId: string }) => entry.gameId),
      identities.map(() => game),
    );
    assert.equal(queries.length, 6);
    const listing = await handleRequest(
      new Request(`http://localhost/api/v1/admin/games/${game}/identities`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      {
        SUPABASE_URL: `http://127.0.0.1:${address.port}`,
        SUPABASE_SECRET_KEY: "fixture-only",
      },
    );
    assert.equal(listing.status, 200);
    assert.equal((await listing.json()).truncated, false);
    assert.equal(new URLSearchParams(queries[6]).get("game_id"), `eq.${game}`);
    for (let i = 0; i < identities.length; i++) {
      const params = new URLSearchParams(queries[i]);
      assert.equal(params.get("provider"), `eq.${identities[i].provider}`);
      assert.equal(params.get("identifier_kind"), "eq.product_id");
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("identity listing validates catalog UUID and requires authentication", async () => {
  const env = {
    SUPABASE_URL: "http://127.0.0.1:1",
    SUPABASE_SECRET_KEY: "fixture-only",
  };
  const path = "http://localhost/api/v1/admin/games";
  assert.equal(
    (await handleRequest(new Request(`${path}/invalid/identities`), env))
      .status,
    400,
  );
  assert.equal(
    (
      await handleRequest(
        new Request(`${path}/00000000-0000-4000-8000-000000000003/identities`),
        env,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handleRequest(
        new Request(`${path}/00000000-0000-4000-8000-000000000003/identities`, {
          method: "POST",
        }),
        env,
      )
    ).status,
    405,
  );
});
test("GOG identity endpoint denies missing session and insecure transport", async () => {
  const path = "/api/v1/admin/identities/gog";
  const env = {
    SUPABASE_URL: "http://127.0.0.1:1",
    SUPABASE_SECRET_KEY: "fixture-only",
  };
  assert.equal(
    (
      await handleRequest(
        new Request(`http://localhost${path}`, { method: "POST" }),
        env,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handleRequest(
        new Request(`http://example.invalid${path}`, { method: "POST" }),
        env,
      )
    ).status,
    403,
  );
});
