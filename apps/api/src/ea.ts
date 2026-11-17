import type { EAStorePreview } from "@knowngdb/contracts";

const eaSlug = /^[a-z0-9][a-z0-9-]{0,79}$/;
const officialHost = "www.ea.com";

type Fetcher = typeof fetch;

const clean = (value: string | null | undefined) => {
  const result = value?.replace(/\s+/g, " ").trim();
  return result || null;
};

function attribute(tag: string, name: string) {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(
    tag,
  );
  return match?.[1] ?? null;
}

function metaValues(html: string) {
  const values = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key =
      attribute(tag, "property") ??
      attribute(tag, "name") ??
      attribute(tag, "itemprop");
    const content = attribute(tag, "content");
    if (key && content && !values.has(key.toLowerCase()))
      values.set(key.toLowerCase(), content);
  }
  return values;
}

function jsonLdValues(html: string) {
  const values: Record<string, unknown>[] = [];
  for (const block of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const value = JSON.parse(block[1]) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value))
        values.push(value as Record<string, unknown>);
    } catch {
      // Invalid structured data does not invalidate the official page.
    }
  }
  return values;
}

function titleFromDocument(html: string, meta: Map<string, string>) {
  return (
    clean(
      meta.get("og:title") ??
        meta.get("name") ??
        /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ??
        null,
    )?.replace(/\s*[-|]\s*(?:Electronic Arts|EA)\s*$/i, "") ?? null
  );
}

export function eaStoreUrl(seriesSlug: string, gameSlug: string) {
  if (!eaSlug.test(seriesSlug) || !eaSlug.test(gameSlug))
    throw Error("Invalid EA game slug.");
  return `https://${officialHost}/games/${seriesSlug}/${gameSlug}/buy`;
}

export function parseEAStorePage(
  html: string,
  seriesSlug: string,
  gameSlug: string,
  fetchedAt = new Date().toISOString(),
): EAStorePreview {
  const url = eaStoreUrl(seriesSlug, gameSlug);
  const meta = metaValues(html);
  const structured = jsonLdValues(html);
  const first = structured[0];
  const description = clean(
    meta.get("description") ??
      (typeof first?.description === "string" ? first.description : null),
  );
  const image = typeof first?.image === "string" ? first.image : null;
  const releaseDate =
    typeof first?.datePublished === "string" ? first.datePublished : null;
  return {
    provider: "ea",
    seriesSlug,
    gameSlug,
    url,
    title: titleFromDocument(html, meta),
    description,
    imageUrl: clean(meta.get("og:image") ?? image),
    releaseDate: clean(meta.get("datepublished") ?? releaseDate),
    identities: [
      { kind: "series_slug", value: seriesSlug },
      { kind: "game_slug", value: gameSlug },
    ],
    fetchedAt,
    sourceKind: "publisher_page",
  };
}

export async function fetchEAStorePreview(
  seriesSlug: string,
  gameSlug: string,
  options: {
    signal?: AbortSignal;
    fetcher?: Fetcher;
    clock?: () => string;
  } = {},
): Promise<EAStorePreview> {
  const url = eaStoreUrl(seriesSlug, gameSlug);
  const response = await (options.fetcher ?? fetch)(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "KnownGDB official catalog connector",
    },
    signal: AbortSignal.any([
      options.signal ?? new AbortController().signal,
      AbortSignal.timeout(15000),
    ]),
  });
  if (!response.ok) throw Error(`EA page returned HTTP ${response.status}.`);
  return parseEAStorePage(
    await response.text(),
    seriesSlug,
    gameSlug,
    options.clock?.() ?? new Date().toISOString(),
  );
}

export const isEAPreviewRoute = (path: string) =>
  path === "/api/v1/admin/store/ea/preview";
export const isEAConfirmRoute = (path: string) =>
  path === "/api/v1/admin/store/ea/confirm";
