import type { PlayStationStorePreview } from "@knowngdb/contracts";

const conceptId = /^[0-9]{5,10}$/;
const productId = /^[A-Z]{2}[0-9]{4}-[A-Z0-9]+(?:_[A-Z0-9]+)?(?:-[A-Z0-9]+)?$/;
const storeLocale = /^[a-z]{2}-[a-z]{2}$/;
const officialHost = "store.playstation.com";

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
  return clean(
    meta.get("og:title") ??
      meta.get("name") ??
      /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ??
      null,
  );
}

export function playStationStoreUrl(
  pageKind: "concept" | "product",
  identifier: string,
  locale = "en-us",
) {
  if (!storeLocale.test(locale))
    throw Error("Invalid PlayStation Store locale.");
  if (pageKind === "concept" && !conceptId.test(identifier))
    throw Error("Invalid PlayStation Store concept ID.");
  if (pageKind === "product" && !productId.test(identifier))
    throw Error("Invalid PlayStation Store product ID.");
  return `https://${officialHost}/${locale}/${pageKind}/${identifier}`;
}

export function parsePlayStationStorePage(
  html: string,
  pageKind: "concept" | "product",
  identifier: string,
  locale = "en-us",
  fetchedAt = new Date().toISOString(),
): PlayStationStorePreview {
  const url = playStationStoreUrl(pageKind, identifier, locale);
  const meta = metaValues(html);
  const structured = jsonLdValues(html);
  const first = structured[0];
  return {
    provider: "playstation",
    pageKind,
    identifier,
    locale,
    url,
    title: titleFromDocument(html, meta),
    description: clean(
      meta.get("description") ??
        (typeof first?.description === "string" ? first.description : null),
    ),
    imageUrl: clean(
      meta.get("og:image") ??
        (typeof first?.image === "string" ? first.image : null),
    ),
    releaseDate: clean(
      meta.get("datepublished") ??
        (typeof first?.datePublished === "string" ? first.datePublished : null),
    ),
    identities: [
      {
        kind: pageKind === "concept" ? "concept_id" : "product_id",
        value: identifier,
      },
    ],
    fetchedAt,
    sourceKind: "official_store_page",
  };
}

export async function fetchPlayStationStorePreview(
  pageKind: "concept" | "product",
  identifier: string,
  options: {
    locale?: string;
    signal?: AbortSignal;
    fetcher?: Fetcher;
    clock?: () => string;
  } = {},
): Promise<PlayStationStorePreview> {
  const locale = options.locale ?? "en-us";
  const url = playStationStoreUrl(pageKind, identifier, locale);
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
  if (!response.ok)
    throw Error(`PlayStation Store returned HTTP ${response.status}.`);
  return parsePlayStationStorePage(
    await response.text(),
    pageKind,
    identifier,
    locale,
    options.clock?.() ?? new Date().toISOString(),
  );
}

export const isPlayStationPreviewRoute = (path: string) =>
  path === "/api/v1/admin/store/playstation/preview";
export const isPlayStationConfirmRoute = (path: string) =>
  path === "/api/v1/admin/store/playstation/confirm";
