import test from "node:test";
import assert from "node:assert/strict";
import {
  epicStoreUrl,
  fetchEpicStorePreview,
  parseEpicStorePage,
} from "../apps/api/src/epic.ts";

const html = `<!doctype html>
<html><head>
<title>Fixture Epic Game | Epic Games Store</title>
<meta property="og:title" content="Fixture Epic Game | Epic Games Store">
<meta property="og:image" content="https://cdn.example.invalid/epic.jpg">
<meta name="description" content="An official Epic fixture description.">
<script type="application/ld+json">{"@type":"VideoGame","datePublished":"2026-04-07","description":"Structured description"}</script>
<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"product":{"namespace":"fixture.namespace","catalogItemId":"fixture.catalog-item","offerId":"fixture.offer"}}}}</script>
</head><body></body></html>`;

test("Epic parser extracts metadata and distinct provider identities", () => {
  const preview = parseEpicStorePage(
    html,
    "fixture-game",
    "en-US",
    "2026-11-02T00:00:00.000Z",
  );
  assert.deepEqual(preview, {
    provider: "epic",
    slug: "fixture-game",
    url: "https://store.epicgames.com/en-US/p/fixture-game",
    locale: "en-US",
    title: "Fixture Epic Game",
    description: "An official Epic fixture description.",
    imageUrl: "https://cdn.example.invalid/epic.jpg",
    releaseDate: "2026-04-07",
    identities: [
      { kind: "slug", value: "fixture-game" },
      { kind: "namespace", value: "fixture.namespace" },
      { kind: "catalog_item_id", value: "fixture.catalog-item" },
      { kind: "offer_id", value: "fixture.offer" },
    ],
    fetchedAt: "2026-11-02T00:00:00.000Z",
    sourceKind: "official_store_page",
  });
});

test("Epic connector constructs only the official localized URL", async () => {
  assert.equal(
    epicStoreUrl("fixture-game", "en-US"),
    "https://store.epicgames.com/en-US/p/fixture-game",
  );
  let requested = "";
  const preview = await fetchEpicStorePreview("fixture-game", {
    locale: "es-ES",
    clock: () => "2026-11-02T00:00:00.000Z",
    fetcher: async (input, init) => {
      requested = String(input);
      assert.equal(
        init?.headers && new Headers(init.headers).get("Accept"),
        "text/html,application/xhtml+xml",
      );
      return new Response(html, { status: 200 });
    },
  });
  assert.equal(requested, "https://store.epicgames.com/es-ES/p/fixture-game");
  assert.equal(preview.locale, "es-ES");
});

test("Epic connector rejects malformed or arbitrary identifiers", async () => {
  assert.throws(() => epicStoreUrl("https://evil.invalid"));
  assert.throws(() => epicStoreUrl("fixture-game", "https://evil.invalid"));
  await assert.rejects(
    fetchEpicStorePreview("fixture game"),
    /Invalid Epic Games Store slug/,
  );
});
