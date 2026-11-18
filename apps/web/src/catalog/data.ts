import type { GameSummary } from "@knowngdb/contracts";
const ttl = 5 * 60_000;
const maxEntries = 60;
type Entry = { expiresAt: number; value: unknown };
const cache = new Map<string, Entry>();
type Pending = {
  controller: AbortController;
  promise: Promise<unknown>;
  users: number;
};
const pending = new Map<string, Pending>();
const metadataCache = new Map<string, Entry>();
const metadataPending = new Map<string, Promise<unknown>>();

function remember(map: Map<string, Entry>, key: string, value: unknown) {
  map.delete(key);
  map.set(key, { value, expiresAt: Date.now() + ttl });
  while (map.size > maxEntries) map.delete(map.keys().next().value!);
}

export function readCatalogCache<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value as T;
}

export async function fetchCatalog<T>(
  key: string,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const cached = readCatalogCache<T>(key);
  if (cached !== undefined) return cached;
  let entry = pending.get(key);
  if (!entry) {
    const controller = new AbortController();
    const promise = fetch(key, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error || "Catalog unavailable.");
        controller.signal.throwIfAborted();
        remember(cache, key, body);
        return body as T;
      })
      .finally(() => {
        if (pending.get(key)?.controller === controller) pending.delete(key);
      });
    entry = { controller, promise, users: 0 };
    pending.set(key, entry);
  }
  const shared = entry;
  shared.users++;
  const cancel = () => {
    if (--shared.users === 0) {
      if (pending.get(key) === shared) pending.delete(key);
      shared.controller.abort();
    }
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const result = await shared.promise;
    signal?.throwIfAborted();
    return result as T;
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (!signal?.aborted) shared.users--;
  }
}

export async function fetchPublicMetadata<T>(key: string): Promise<T | null> {
  const entry = metadataCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value as T | null;
  if (entry) metadataCache.delete(key);
  const active = metadataPending.get(key);
  if (active) return active as Promise<T | null>;
  const request = fetch(key, { credentials: "same-origin" })
    .then(async (response) => {
      if (response.status === 204 || response.status === 404) return null;
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error || "Game information unavailable.");
      return body as T;
    })
    .then((value) => {
      remember(metadataCache, key, value);
      return value;
    });
  metadataPending.set(key, request);
  try {
    return await request;
  } finally {
    if (metadataPending.get(key) === request) metadataPending.delete(key);
  }
}

export const homeCatalogKey = "/api/v1/catalog/home?view=titles";
export function searchCatalogKey(query: string) {
  return `/api/v1/catalog/search?view=titles&q=${encodeURIComponent(query)}`;
}
export function gameCatalogKey(gameId: string, language: string) {
  return `/api/v1/catalog/games/${encodeURIComponent(gameId)}?language=${encodeURIComponent(language)}`;
}

export function versionPageKey(gameId: string, cursor?: string | null) {
  return `/api/v1/games/${encodeURIComponent(gameId)}/asset-versions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
}

export function readGameSummary(id: string, language: string) {
  const detail = readCatalogCache<{ game: GameSummary }>(
    gameCatalogKey(id, language),
  );
  if (detail) return detail.game;
  for (const [key, entry] of cache) {
    if (
      entry.expiresAt <= Date.now() ||
      (key !== homeCatalogKey &&
        !key.startsWith("/api/v1/catalog/search?view=titles&"))
    )
      continue;
    const list = entry.value as { games: GameSummary[] };
    const game = list.games.find(
      (item) => item.id === id && item.language === language,
    );
    if (game) return game;
  }
}
