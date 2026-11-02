import type {
  EpicStoreIdentity,
  EpicStoreIdentityKind,
  EpicStorePreview,
} from "@knowngdb/contracts";
import { OfficialStoreResponseError } from "./store-errors.ts";

const epicSlug = /^[A-Za-z0-9][A-Za-z0-9-]{0,119}$/;
const epicLocale = /^[a-z]{2,3}-[A-Z]{2}$/;
const epicIdentifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const officialHost = "store.epicgames.com";

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
    )?.replace(/\s*[-|]\s*Epic Games Store\s*$/i, "") ?? null
  );
}

function readIdentities(values: unknown[], slug: string): EpicStoreIdentity[] {
  const result: EpicStoreIdentity[] = [{ kind: "slug", value: slug }];
  const seen = new Set(
    result.map((identity) => `${identity.kind}:${identity.value}`),
  );
  const keys: Record<string, EpicStoreIdentityKind> = {
    namespace: "namespace",
    catalogitemid: "catalog_item_id",
    offerid: "offer_id",
  };
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const kind = keys[key.replace(/[^a-z]/gi, "").toLowerCase()];
      if (kind && typeof child === "string" && epicIdentifier.test(child)) {
        const identity = `${kind}:${child}`;
        if (!seen.has(identity)) {
          seen.add(identity);
          result.push({ kind, value: child });
        }
      }
      visit(child);
    }
  };
  for (const value of values) visit(value);
  return result;
}

export function epicStoreUrl(slug: string, locale = "en-US") {
  if (!epicSlug.test(slug)) throw Error("Invalid Epic Games Store slug.");
  if (!epicLocale.test(locale)) throw Error("Invalid Epic Games Store locale.");
  return `https://${officialHost}/${locale}/p/${encodeURIComponent(slug)}`;
}

export function parseEpicStorePage(
  html: string,
  slug: string,
  locale = "en-US",
  fetchedAt = new Date().toISOString(),
): EpicStorePreview {
  const url = epicStoreUrl(slug, locale);
  const meta = metaValues(html);
  const structured = jsonValues(html);
  const description = clean(
    meta.get("description") ??
      structured
        .flatMap((value) => (value && typeof value === "object" ? [value] : []))
        .map((value) => ("description" in value ? value.description : null))
        .find((value): value is string => typeof value === "string") ??
      null,
  );
  const image = structured
    .flatMap((value) => (value && typeof value === "object" ? [value] : []))
    .map((value) => ("image" in value ? value.image : null))
    .find((value): value is string => typeof value === "string");
  const releaseDate = structured
    .flatMap((value) => (value && typeof value === "object" ? [value] : []))
    .map((value) => ("datePublished" in value ? value.datePublished : null))
    .find((value): value is string => typeof value === "string");
  return {
    provider: "epic",
    slug,
    url,
    locale,
    title: titleFromDocument(html, meta),
    description,
    imageUrl: clean(meta.get("og:image") ?? image),
    releaseDate: clean(meta.get("datepublished") ?? releaseDate),
    identities: readIdentities(structured, slug),
    fetchedAt,
    sourceKind: "official_store_page",
  };
}

export async function fetchEpicStorePreview(
  slug: string,
  options: {
    locale?: string;
    signal?: AbortSignal;
    fetcher?: Fetcher;
    clock?: () => string;
  } = {},
): Promise<EpicStorePreview> {
  const locale = options.locale ?? "en-US";
  const url = epicStoreUrl(slug, locale);
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
    throw new OfficialStoreResponseError("Epic Games Store", response.status);
  return parseEpicStorePage(
    await response.text(),
    slug,
    locale,
    options.clock?.() ?? new Date().toISOString(),
  );
}

export const isEpicPreviewRoute = (path: string) =>
  path === "/api/v1/admin/store/epic/preview";
export const isEpicConfirmRoute = (path: string) =>
  path === "/api/v1/admin/store/epic/confirm";
