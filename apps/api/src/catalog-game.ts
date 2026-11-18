import { createClient } from "@supabase/supabase-js";
import type { GameSummary } from "@knowngdb/contracts";
import type { ApiEnvironment } from "./handler.ts";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const languageTag = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const reply = (body: unknown, status: number, cache = "no-store") =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
    },
  });

export const isCatalogGameRoute = (path: string) =>
  /^\/api\/v1\/catalog\/games\/[^/]+$/.test(path);

export async function catalogGame(request: Request, env: ApiEnvironment) {
  if (request.method !== "GET")
    return reply({ error: "Method not allowed." }, 405);
  const url = new URL(request.url);
  const languages = url.searchParams.getAll("language");
  if (
    [...url.searchParams.keys()].some((key) => key !== "language") ||
    languages.length !== 1 ||
    !languageTag.test(languages[0])
  )
    return reply({ error: "Provide one valid catalog language." }, 400);
  const gameId = url.pathname.split("/").at(-1)!;
  if (!uuid.test(gameId))
    return reply({ error: "A canonical game identifier is required." }, 400);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog connection is not configured." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    const { data, error } = await client
      .schema("catalog")
      .from("game_localizations")
      .select("game_id,title,language,games!inner(status,item_type)")
      .eq("game_id", gameId)
      .eq("language", languages[0])
      .eq("moderation_status", "approved")
      .eq("games.status", "published")
      .maybeSingle();
    if (error)
      return reply({ error: "Catalog is temporarily unavailable." }, 503);
    if (!data) return reply({ error: "Published game not found." }, 404);
    const relation = data.games as unknown as
      | { item_type: GameSummary["itemType"] }
      | Array<{ item_type: GameSummary["itemType"] }>;
    return reply(
      {
        game: {
          id: data.game_id,
          title: data.title,
          language: data.language,
          itemType:
            (Array.isArray(relation) ? relation[0] : relation)?.item_type ??
            "game",
        } satisfies GameSummary,
      },
      200,
      "public, max-age=300, must-revalidate",
    );
  } catch {
    return reply({ error: "Catalog is temporarily unavailable." }, 503);
  }
}
