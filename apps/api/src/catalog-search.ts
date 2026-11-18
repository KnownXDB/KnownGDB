import { createClient } from "@supabase/supabase-js";
import type { GameSummary } from "@knowngdb/contracts";
import type { ApiEnvironment } from "./handler.ts";
import { catalogArtwork } from "./catalog-artwork.ts";

const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

const publicReply = (body: unknown) =>
  Response.json(body, {
    headers: {
      "Cache-Control": "public, max-age=300, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });

export async function catalogSearch(request: Request, env: ApiEnvironment) {
  if (request.method !== "GET")
    return reply({ error: "Method not allowed." }, 405);
  const params = new URL(request.url).searchParams;
  const titlesOnly =
    params.get("view") === "titles" && params.getAll("view").length === 1;
  const query = (params.get("q") ?? "").trim();
  if (
    [...params.keys()].some((key) => key !== "q" && key !== "view") ||
    (params.has("view") && !titlesOnly) ||
    params.getAll("q").length > 1 ||
    !query ||
    query.length > 120
  )
    return reply(
      { error: "Provide a search query up to 120 characters." },
      400,
    );
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
      .eq("moderation_status", "approved")
      .eq("games.status", "published")
      .ilike("title", `%${query.replace(/[\\%_]/g, "\\$&")}%`)
      .order("title")
      .limit(50)
      .abortSignal(request.signal);
    if (error)
      return reply({ error: "Catalog is temporarily unavailable." }, 503);

    const games: GameSummary[] = (data ?? []).map((row) => {
      const relation = row.games as unknown as
        | { item_type: GameSummary["itemType"] }
        | Array<{ item_type: GameSummary["itemType"] }>;
      return {
        id: row.game_id,
        title: row.title,
        language: row.language,
        itemType:
          (Array.isArray(relation) ? relation[0] : relation)?.item_type ??
          "game",
      };
    });
    if (titlesOnly) return publicReply({ games });
    if (!games.length) return publicReply({ games, artwork: [] });

    const artworkUrl = new URL("/api/v1/catalog/artwork", request.url);
    artworkUrl.searchParams.set(
      "ids",
      [...new Set(games.map((game) => game.id))].join(","),
    );
    const artworkResponse = await catalogArtwork(
      new Request(artworkUrl, { method: "GET", signal: request.signal }),
      env,
    );
    if (!artworkResponse.ok)
      return reply({ error: "Artwork is temporarily unavailable." }, 503);
    const { artwork } = (await artworkResponse.json()) as {
      artwork: unknown[];
    };
    return publicReply({ games, artwork });
  } catch {
    return reply({ error: "Catalog is temporarily unavailable." }, 503);
  }
}
