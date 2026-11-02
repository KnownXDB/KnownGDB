import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchSteamStorePreview,
  parseSteamStorePage,
} from "../apps/api/src/steam.ts";

const html = `<!doctype html>
<html><head>
<title>Fixture Game - Steam</title>
<meta property="og:title" content="Fixture Game - Steam">
<meta property="og:image" content="https://cdn.example.invalid/fixture.jpg">
<meta name="description" content="An official fixture description.">
<script type="application/ld+json">{"@type":"VideoGame","datePublished":"2026-04-05","description":"Structured description"}</script>
</head><body></body></html>`;

test("Steam parser normalizes official page metadata without changing identity", () => {
  const preview = parseSteamStorePage(
    html,
    "123456",
    "US",
    "en-US",
    "2026-10-29T00:00:00.000Z",
  );
  assert.deepEqual(preview, {
    provider: "steam",
    appId: "123456",
    url: "https://store.steampowered.com/app/123456/?cc=us&l=en-US",
    region: "US",
    locale: "en-US",
    title: "Fixture Game",
    description: "An official fixture description.",
    imageUrl: "https://cdn.example.invalid/fixture.jpg",
    releaseDate: "2026-04-05",
    fetchedAt: "2026-10-29T00:00:00.000Z",
    sourceKind: "official_store_page",
  });
});

test("Steam connector only constructs the official host and supports cancellation", async () => {
  let requested = "";
  const preview = await fetchSteamStorePreview("123456", {
    region: "UY",
    locale: null,
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
  assert.equal(requested, "https://store.steampowered.com/app/123456/?cc=uy");
  assert.equal(preview.region, "UY");
  assert.equal(preview.locale, null);
});

test("Steam connector rejects arbitrary or malformed identifiers", async () => {
  assert.throws(() => parseSteamStorePage(html, "0", "US", "en"));
  await assert.rejects(
    fetchSteamStorePreview("123456", { region: "https://evil.invalid" }),
    /Invalid Steam region/,
  );
});
