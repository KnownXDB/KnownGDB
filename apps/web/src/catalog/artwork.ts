import type { GameSummary } from "@knowngdb/contracts";
export const coverKey = (game: Pick<GameSummary, "id" | "language">) =>
  game.id + ":" + game.language;
const cache = new Map<string, { version: string | null; expires: number }>();
export function readCovers(games: GameSummary[]) {
  const result = new Map<string, string | null>();
  for (const game of games) {
    const key = coverKey(game);
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) result.set(key, hit.version);
    else cache.delete(key);
  }
  return result;
}
export async function loadCovers(games: GameSummary[], signal: AbortSignal) {
  const params = new URLSearchParams();
  for (const game of games) params.append("item", coverKey(game));
  const response = await fetch("/api/v1/catalog/covers?" + params, { signal });
  if (!response.ok) throw Error("Artwork unavailable.");
  const { covers } = (await response.json()) as {
    covers: Array<{ game_id: string; language: string; version_id: string }>;
  };
  signal.throwIfAborted();
  const result = new Map<string, string | null>(
    games.map((game) => [coverKey(game), null]),
  );
  for (const row of covers) {
    const key = coverKey({ id: row.game_id, language: row.language });
    if (result.has(key)) result.set(key, row.version_id);
  }
  const expires = Date.now() + 300_000;
  for (const [key, version] of result) {
    cache.delete(key);
    cache.set(key, { version, expires });
  }
  while (cache.size > 500) cache.delete(cache.keys().next().value!);
  return result;
}
