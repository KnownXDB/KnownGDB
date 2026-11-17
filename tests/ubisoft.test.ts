import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchUbisoftStorePreview,
  parseUbisoftStorePage,
  ubisoftStoreUrl,
} from "../apps/api/src/ubisoft.ts";

const html = `<!doctype html>
<html><head>
<title>Fixture Ubisoft Game - Ubisoft Store</title>
<meta property="og:title" content="Fixture Ubisoft Game - Ubisoft Store">
<meta property="og:image" content="https://cdn.example.invalid/ubisoft.jpg">
<meta name="description" content="An official Ubisoft fixture description.">
<script type="application/ld+json">{"@type":"VideoGame","datePublished":"2026-04-09","description":"Structured description","productId":"fixture.product","sku":"fixture.sku"}</script>
</head><body data-pid="fixture.product"></body></html>`;

test("Ubisoft parser extracts metadata and distinct Store identities", () => {
  const preview = parseUbisoftStorePage(
    html,
    "far-cry-6",
    "US",
    "en_US",
    "2026-11-02T00:00:00.000Z",
  );
  assert.deepEqual(preview, {
    provider: "ubisoft",
    storeSlug: "far-cry-6",
    region: "US",
    locale: "en_US",
    url: "https://store.ubisoft.com/us/far-cry-6?lang=en_US",
    title: "Fixture Ubisoft Game",
    description: "An official Ubisoft fixture description.",
    imageUrl: "https://cdn.example.invalid/ubisoft.jpg",
    releaseDate: "2026-04-09",
    identities: [
      { kind: "store_slug", value: "far-cry-6" },
      { kind: "product_id", value: "fixture.product" },
      { kind: "sku", value: "fixture.sku" },
    ],
    fetchedAt: "2026-11-02T00:00:00.000Z",
    sourceKind: "official_store_page",
  });
});

test("Ubisoft connector constructs only the official regional URL", async () => {
  assert.equal(
    ubisoftStoreUrl("far-cry-6", "US", "en_US"),
    "https://store.ubisoft.com/us/far-cry-6?lang=en_US",
  );
  let requested = "";
  const preview = await fetchUbisoftStorePreview("far-cry-6", {
    region: "GB",
    locale: null,
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
  assert.equal(requested, "https://store.ubisoft.com/gb/far-cry-6");
  assert.equal(preview.region, "GB");
  assert.equal(preview.locale, null);
});

test("Ubisoft connector rejects malformed or arbitrary identifiers", async () => {
  assert.throws(() => ubisoftStoreUrl("https://evil.invalid"));
  assert.throws(() => ubisoftStoreUrl("far-cry-6", "https://evil.invalid"));
  assert.throws(() =>
    ubisoftStoreUrl("far-cry-6", "US", "https://evil.invalid"),
  );
  await assert.rejects(
    fetchUbisoftStorePreview("Far Cry 6"),
    /Invalid Ubisoft Store slug/,
  );
});
