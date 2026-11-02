import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchPlayStationStorePreview,
  parsePlayStationStorePage,
  playStationStoreUrl,
} from "../apps/api/src/playstation.ts";

const html = `<!doctype html>
<html><head>
<title>Fixture PlayStation Game</title>
<meta property="og:title" content="Fixture PlayStation Game">
<meta property="og:image" content="https://cdn.example.invalid/playstation.jpg">
<meta name="description" content="An official PlayStation fixture description.">
<script type="application/ld+json">{"@type":"VideoGame","datePublished":"2026-04-10","description":"Structured description"}</script>
</head><body></body></html>`;

test("PlayStation parser preserves concept and product identity scope", () => {
  assert.deepEqual(
    parsePlayStationStorePage(
      html,
      "concept",
      "10000333",
      "en-us",
      "2026-11-02T00:00:00.000Z",
    ),
    {
      provider: "playstation",
      pageKind: "concept",
      identifier: "10000333",
      locale: "en-us",
      url: "https://store.playstation.com/en-us/concept/10000333",
      title: "Fixture PlayStation Game",
      description: "An official PlayStation fixture description.",
      imageUrl: "https://cdn.example.invalid/playstation.jpg",
      releaseDate: "2026-04-10",
      identities: [{ kind: "concept_id", value: "10000333" }],
      fetchedAt: "2026-11-02T00:00:00.000Z",
      sourceKind: "official_store_page",
    },
  );
  const product = parsePlayStationStorePage(
    html,
    "product",
    "UP0891-CUSA19113_00-RATACONCEPTDESTR",
    "en-us",
  );
  assert.deepEqual(product.identities, [
    { kind: "product_id", value: "UP0891-CUSA19113_00-RATACONCEPTDESTR" },
  ]);
});

test("PlayStation connector constructs only official localized URLs", async () => {
  assert.equal(
    playStationStoreUrl("concept", "10000333", "en-ca"),
    "https://store.playstation.com/en-ca/concept/10000333",
  );
  assert.equal(
    playStationStoreUrl(
      "product",
      "UP0891-CUSA19113_00-RATACONCEPTDESTR",
      "en-us",
    ),
    "https://store.playstation.com/en-us/product/UP0891-CUSA19113_00-RATACONCEPTDESTR",
  );
  let requested = "";
  const preview = await fetchPlayStationStorePreview("concept", "10000333", {
    locale: "es-ar",
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
  assert.equal(
    requested,
    "https://store.playstation.com/es-ar/concept/10000333",
  );
  assert.equal(preview.locale, "es-ar");
});

test("PlayStation connector rejects malformed or arbitrary identifiers", async () => {
  assert.throws(() => playStationStoreUrl("concept", "https://evil.invalid"));
  assert.throws(() => playStationStoreUrl("product", "10000333"));
  assert.throws(() =>
    playStationStoreUrl("concept", "10000333", "https://evil.invalid"),
  );
  await assert.rejects(
    fetchPlayStationStorePreview("product", "not-a-product"),
    /Invalid PlayStation Store product ID/,
  );
});
