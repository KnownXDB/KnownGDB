import test from "node:test";
import assert from "node:assert/strict";
import {
  eaStoreUrl,
  fetchEAStorePreview,
  parseEAStorePage,
} from "../apps/api/src/ea.ts";

const html = `<!doctype html>
<html><head>
<title>Fixture EA Game | Electronic Arts</title>
<meta property="og:title" content="Fixture EA Game | Electronic Arts">
<meta property="og:image" content="https://cdn.example.invalid/ea.jpg">
<meta name="description" content="An official EA fixture description.">
<script type="application/ld+json">{"@type":"VideoGame","datePublished":"2026-04-08","description":"Structured description"}</script>
</head><body></body></html>`;

test("EA parser extracts official publisher metadata and scoped slugs", () => {
  const preview = parseEAStorePage(
    html,
    "ea-sports-fc",
    "fc-27",
    "2026-11-02T00:00:00.000Z",
  );
  assert.deepEqual(preview, {
    provider: "ea",
    seriesSlug: "ea-sports-fc",
    gameSlug: "fc-27",
    url: "https://www.ea.com/games/ea-sports-fc/fc-27/buy",
    title: "Fixture EA Game",
    description: "An official EA fixture description.",
    imageUrl: "https://cdn.example.invalid/ea.jpg",
    releaseDate: "2026-04-08",
    identities: [
      { kind: "series_slug", value: "ea-sports-fc" },
      { kind: "game_slug", value: "fc-27" },
    ],
    fetchedAt: "2026-11-02T00:00:00.000Z",
    sourceKind: "publisher_page",
  });
});

test("EA connector constructs only the official publisher URL", async () => {
  assert.equal(
    eaStoreUrl("ea-sports-fc", "fc-27"),
    "https://www.ea.com/games/ea-sports-fc/fc-27/buy",
  );
  let requested = "";
  const preview = await fetchEAStorePreview("ea-sports-fc", "fc-27", {
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
  assert.equal(requested, "https://www.ea.com/games/ea-sports-fc/fc-27/buy");
  assert.equal(preview.gameSlug, "fc-27");
});

test("EA connector rejects malformed or arbitrary identifiers", async () => {
  assert.throws(() => eaStoreUrl("https://evil.invalid", "fc-27"));
  assert.throws(() => eaStoreUrl("ea-sports-fc", "https://evil.invalid"));
  await assert.rejects(
    fetchEAStorePreview("EA Sports FC", "fc-27"),
    /Invalid EA game slug/,
  );
});
