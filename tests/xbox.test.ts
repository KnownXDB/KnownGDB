import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchXboxStorePreview,
  parseXboxStorePage,
  xboxStoreUrl,
} from "../apps/api/src/xbox.ts";

const html = `<!doctype html>
<html><head>
<title>Fixture Xbox Game</title>
<meta property="og:title" content="Fixture Xbox Game">
<meta property="og:image" content="https://cdn.example.invalid/xbox.jpg">
<meta name="description" content="An official Microsoft Store fixture description.">
<script type="application/ld+json">{"@type":"VideoGame","datePublished":"2026-04-06","description":"Structured description"}</script>
</head><body></body></html>`;

test("Xbox parser extracts metadata without changing Store identity", () => {
  const preview = parseXboxStorePage(
    html,
    "9NV0ZMV5GB11",
    "2026-10-29T00:00:00.000Z",
  );
  assert.deepEqual(preview, {
    provider: "xbox",
    storeId: "9NV0ZMV5GB11",
    url: "https://apps.microsoft.com/store/detail/9NV0ZMV5GB11",
    title: "Fixture Xbox Game",
    description: "An official Microsoft Store fixture description.",
    imageUrl: "https://cdn.example.invalid/xbox.jpg",
    releaseDate: "2026-04-06",
    fetchedAt: "2026-10-29T00:00:00.000Z",
    sourceKind: "official_store_page",
  });
});

test("Xbox connector constructs only the documented official URL", async () => {
  assert.equal(
    xboxStoreUrl("9NV0ZMV5GB11"),
    "https://apps.microsoft.com/store/detail/9NV0ZMV5GB11",
  );
  let requested = "";
  const preview = await fetchXboxStorePreview("9NV0ZMV5GB11", {
    clock: () => "2026-10-29T00:00:00.000Z",
    fetcher: async (input, init) => {
      requested = String(input);
      assert.equal(
        init?.headers && new Headers(init.headers).get("Accept"),
        "text/html,application/xhtml+xml",
      );
      return new Response(html, { status: 200 });
    },
  });
  assert.equal(
    requested,
    "https://apps.microsoft.com/store/detail/9NV0ZMV5GB11",
  );
  assert.equal(preview.storeId, "9NV0ZMV5GB11");
});

test("Xbox connector rejects malformed or arbitrary identifiers", async () => {
  assert.throws(() => xboxStoreUrl("https://evil.invalid"));
  await assert.rejects(
    fetchXboxStorePreview("9NV0ZMV5GB1!"),
    /Invalid Xbox Store ID/,
  );
});
