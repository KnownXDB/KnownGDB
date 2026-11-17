import type { SteamStorePreview } from "@knowngdb/contracts";

const steamAppId = /^[1-9][0-9]{0,9}$/;
const steamRegion = /^[A-Z0-9]{2,8}$/;
const steamLocale = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const officialHost = "store.steampowered.com";

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
  for (const block of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const value = JSON.parse(block[1]) as Record<string, unknown>;
      if (value && typeof value === "object") return value;
    } catch {
      // Invalid structured data does not invalidate the official page.
    }
  }
  return null;
}

function titleFromDocument(html: string, meta: Map<string, string>) {
  const value =
    meta.get("og:title") ??
    meta.get("name") ??
    /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ??
    null;
  return clean(value)?.replace(/\s+-\s+Steam\s*$/i, "") ?? null;
}

export function parseSteamStorePage(
  html: string,
  appId: string,
  region: string,
  locale: string | null,
  fetchedAt = new Date().toISOString(),
): SteamStorePreview {
  if (!steamAppId.test(appId)) throw Error("Invalid Steam App ID.");
  if (!steamRegion.test(region)) throw Error("Invalid Steam region.");
  if (locale !== null && !steamLocale.test(locale))
    throw Error("Invalid Steam locale.");
  const meta = metaValues(html);
  const structured = jsonLdValues(html);
  const description = clean(
    meta.get("description") ??
      (typeof structured?.description === "string"
        ? structured.description
        : null),
  );
  const image = structured?.image;
  return {
    provider: "steam",
    appId,
    url: `https://${officialHost}/app/${appId}/?cc=${region.toLowerCase()}${locale ? `&l=${encodeURIComponent(locale)}` : ""}`,
    region,
    locale,
    title: titleFromDocument(html, meta),
    description,
    imageUrl: clean(
      meta.get("og:image") ?? (typeof image === "string" ? image : null),
    ),
    releaseDate: clean(
      meta.get("datepublished") ??
        (typeof structured?.datePublished === "string"
          ? structured.datePublished
          : null),
    ),
    fetchedAt,
    sourceKind: "official_store_page",
  };
}

export async function fetchSteamStorePreview(
  appId: string,
  options: {
    region?: string;
    locale?: string | null;
    signal?: AbortSignal;
    fetcher?: Fetcher;
    clock?: () => string;
  } = {},
): Promise<SteamStorePreview> {
  const region = options.region ?? "US";
  const locale = options.locale === undefined ? "en" : options.locale;
  if (!steamAppId.test(appId)) throw Error("Invalid Steam App ID.");
  if (!steamRegion.test(region)) throw Error("Invalid Steam region.");
  if (locale !== null && !steamLocale.test(locale))
    throw Error("Invalid Steam locale.");
  const url = `https://${officialHost}/app/${appId}/?cc=${region.toLowerCase()}${locale ? `&l=${encodeURIComponent(locale)}` : ""}`;
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
    throw Error(`Steam Store returned HTTP ${response.status}.`);
  return parseSteamStorePage(
    await response.text(),
    appId,
    region,
    locale,
    options.clock?.() ?? new Date().toISOString(),
  );
}

export const isSteamPreviewRoute = (path: string) =>
  path === "/api/v1/admin/store/steam/preview";
export const isSteamConfirmRoute = (path: string) =>
  path === "/api/v1/admin/store/steam/confirm";
