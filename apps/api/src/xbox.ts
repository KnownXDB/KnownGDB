import type { XboxStorePreview } from "@knowngdb/contracts";
import { OfficialStoreResponseError } from "./store-errors.ts";

const xboxStoreId = /^[A-Z0-9]{12}$/;
const officialHost = "apps.microsoft.com";

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
  return clean(
    meta.get("og:title") ??
      meta.get("name") ??
      /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ??
      null,
  );
}

export function xboxStoreUrl(storeId: string) {
  if (!xboxStoreId.test(storeId)) throw Error("Invalid Xbox Store ID.");
  return `https://${officialHost}/store/detail/${storeId}`;
}

export function parseXboxStorePage(
  html: string,
  storeId: string,
  fetchedAt = new Date().toISOString(),
): XboxStorePreview {
  const url = xboxStoreUrl(storeId);
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
    provider: "xbox",
    storeId,
    url,
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

export async function fetchXboxStorePreview(
  storeId: string,
  options: {
    signal?: AbortSignal;
    fetcher?: Fetcher;
    clock?: () => string;
  } = {},
): Promise<XboxStorePreview> {
  const url = xboxStoreUrl(storeId);
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
    throw new OfficialStoreResponseError("Xbox Store", response.status);
  return parseXboxStorePage(
    await response.text(),
    storeId,
    options.clock?.() ?? new Date().toISOString(),
  );
}

export const isXboxPreviewRoute = (path: string) =>
  path === "/api/v1/admin/store/xbox/preview";
export const isXboxConfirmRoute = (path: string) =>
  path === "/api/v1/admin/store/xbox/confirm";
