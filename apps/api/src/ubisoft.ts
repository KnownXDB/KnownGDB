import type {
  UbisoftStoreIdentity,
  UbisoftStorePreview,
} from "@knowngdb/contracts";

const storeSlug = /^[a-z0-9][a-z0-9-]{0,119}$/;
const region = /^[A-Z]{2}$/;
const locale = /^[a-z]{2,3}_[A-Z]{2}$/;
const providerIdentifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const officialHost = "store.ubisoft.com";

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

function jsonValues(html: string) {
  const values: unknown[] = [];
  for (const block of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
  )) {
    const attributes = block[1];
    if (
      !/\btype\s*=\s*["'](?:application\/ld\+json|application\/json)["']/i.test(
        attributes,
      ) &&
      !/\bid\s*=\s*["']__NEXT_DATA__["']/i.test(attributes)
    )
      continue;
    try {
      values.push(JSON.parse(block[2]) as unknown);
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
    )?.replace(/\s*[-|]\s*Ubisoft Store\s*$/i, "") ?? null
  );
}

function structuredValue(values: unknown[], names: string[]) {
  let result: string | null = null;
  const expected = new Set(names.map((name) => name.toLowerCase()));
  const visit = (value: unknown) => {
    if (result) return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (
        expected.has(key.replace(/[^a-z]/gi, "").toLowerCase()) &&
        typeof child === "string" &&
        providerIdentifier.test(child)
      ) {
        result = child;
        return;
      }
      visit(child);
    }
  };
  for (const value of values) visit(value);
  return result;
}

function dataProductId(html: string) {
  for (const tag of html.match(/<[^>]+>/g) ?? []) {
    const value = attribute(tag, "data-pid");
    if (value && providerIdentifier.test(value)) return value;
  }
  return null;
}

export function ubisoftStoreUrl(
  storeSlugValue: string,
  storeRegion = "US",
  storeLocale: string | null = "en_US",
) {
  if (!storeSlug.test(storeSlugValue))
    throw Error("Invalid Ubisoft Store slug.");
  if (!region.test(storeRegion)) throw Error("Invalid Ubisoft Store region.");
  if (storeLocale !== null && !locale.test(storeLocale))
    throw Error("Invalid Ubisoft Store locale.");
  return `https://${officialHost}/${storeRegion.toLowerCase()}/${storeSlugValue}${storeLocale ? `?lang=${encodeURIComponent(storeLocale)}` : ""}`;
}

export function parseUbisoftStorePage(
  html: string,
  storeSlugValue: string,
  storeRegion: string,
  storeLocale: string | null,
  fetchedAt = new Date().toISOString(),
): UbisoftStorePreview {
  const url = ubisoftStoreUrl(storeSlugValue, storeRegion, storeLocale);
  const meta = metaValues(html);
  const structured = jsonValues(html);
  const productId =
    dataProductId(html) ?? structuredValue(structured, ["productId"]);
  const sku = structuredValue(structured, ["sku", "productSku"]);
  const identities: UbisoftStoreIdentity[] = [
    { kind: "store_slug", value: storeSlugValue },
  ];
  if (productId) identities.push({ kind: "product_id", value: productId });
  if (sku && sku !== productId) identities.push({ kind: "sku", value: sku });
  const first = structured.find((value): value is Record<string, unknown> =>
    Boolean(value && typeof value === "object" && !Array.isArray(value)),
  );
  return {
    provider: "ubisoft",
    storeSlug: storeSlugValue,
    region: storeRegion,
    locale: storeLocale,
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
    identities,
    fetchedAt,
    sourceKind: "official_store_page",
  };
}

export async function fetchUbisoftStorePreview(
  storeSlugValue: string,
  options: {
    region?: string;
    locale?: string | null;
    signal?: AbortSignal;
    fetcher?: Fetcher;
    clock?: () => string;
  } = {},
): Promise<UbisoftStorePreview> {
  const storeRegion = options.region ?? "US";
  const storeLocale = options.locale === undefined ? "en_US" : options.locale;
  const url = ubisoftStoreUrl(storeSlugValue, storeRegion, storeLocale);
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
    throw Error(`Ubisoft Store returned HTTP ${response.status}.`);
  return parseUbisoftStorePage(
    await response.text(),
    storeSlugValue,
    storeRegion,
    storeLocale,
    options.clock?.() ?? new Date().toISOString(),
  );
}

export const isUbisoftPreviewRoute = (path: string) =>
  path === "/api/v1/admin/store/ubisoft/preview";
export const isUbisoftConfirmRoute = (path: string) =>
  path === "/api/v1/admin/store/ubisoft/confirm";
