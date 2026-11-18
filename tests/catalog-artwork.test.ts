import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { handleRequest } from "../apps/api/src/handler.ts";

test("catalog artwork exposes only eligible public versions and validates requests", async () => {
  const gameId = "00000000-0000-4000-8000-000000000001";
  const versionId = "00000000-0000-4000-8000-000000000002";
  const eligible = {
    id: versionId,
    game_id: gameId,
    created_at: "2020-01-01T00:00:00Z",
    language_kind: "global",
    language_tags: [],
    context_key: "base",
    valid_from: null,
    valid_until: null,
    moderation_status: "approved",
    publication_status: "published",
    storage_verified_at: "2020-01-01T00:00:00Z",
    rights_reference: "private rights evidence",
    object_key: "private key",
    asset_collections: { role: "capsule", games: { status: "published" } },
  };
  const rows = [
    eligible,
    { ...eligible, publication_status: "draft" },
    { ...eligible, moderation_status: "pending" },
    { ...eligible, storage_verified_at: null },
    { ...eligible, rights_reference: "" },
    { ...eligible, game_id: "00000000-0000-4000-8000-000000000003" },
    { ...eligible, created_at: "2999-01-01T00:00:00Z" },
    { ...eligible, valid_from: "2999-01-01T00:00:00Z" },
    { ...eligible, valid_until: "2020-01-01T00:00:00Z" },
    { ...eligible, valid_until: "invalid" },
    { ...eligible, language_tags: null },
    { ...eligible, context_key: "other" },
    {
      ...eligible,
      asset_collections: { role: "capsule", games: { status: "draft" } },
    },
    {
      ...eligible,
      asset_collections: { role: "icon", games: { status: "published" } },
    },
  ];
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(rows));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const env = {
    SUPABASE_URL: `http://127.0.0.1:${address.port}`,
    SUPABASE_SECRET_KEY: "test-only",
  };
  const request = (query: string, method = "GET") =>
    new Request(`http://localhost/api/v1/catalog/artwork${query}`, { method });
  try {
    const response = await handleRequest(request(`?ids=${gameId}`), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      artwork: [
        {
          gameId,
          versionId,
          role: "capsule",
          languageKind: "global",
          languages: [],
        },
      ],
    });
    for (const query of [
      "",
      "?ids=invalid",
      `?ids=${gameId}&extra=1`,
      `?ids=${gameId}&ids=${gameId}`,
      `?ids=${Array(51).fill(gameId).join(",")}`,
    ])
      assert.equal((await handleRequest(request(query), env)).status, 400);
    assert.equal(
      (await handleRequest(request(`?ids=${gameId}`, "POST"), env)).status,
      405,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("title views keep one catalog read even when artwork is unavailable", async () => {
  const reads: string[] = [];
  const gameId = "00000000-0000-4000-8000-000000000001";
  const server = createServer((req, res) => {
    const table = new URL(req.url!, "http://localhost").pathname;
    reads.push(table);
    const titles = table.endsWith("/game_localizations");
    res.writeHead(titles ? 200 : 503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        titles
          ? [
              {
                game_id: gameId,
                title: "Fixture",
                language: "en",
                games: { item_type: "game" },
              },
            ]
          : {},
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const env = {
      SUPABASE_URL: "http://127.0.0.1:" + address.port,
      SUPABASE_SECRET_KEY: "test-only",
    };
    for (const route of ["home?view=titles", "search?view=titles&q=fixture"]) {
      const response = await handleRequest(
        new Request("http://localhost/api/v1/catalog/" + route),
        env,
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        games: [
          { id: gameId, title: "Fixture", language: "en", itemType: "game" },
        ],
      });
    }
    assert.deepEqual(reads, [
      "/rest/v1/game_localizations",
      "/rest/v1/game_localizations",
    ]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
