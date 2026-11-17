import { createClient } from "@supabase/supabase-js";
import type { ApiEnvironment } from "./handler.ts";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function catalogArtwork(request: Request, env: ApiEnvironment) {
  if (request.method !== "GET")
    return reply({ error: "Method not allowed." }, 405);
  const params = new URL(request.url).searchParams;
  if (
    [...params.keys()].some((key) => key !== "ids") ||
    params.getAll("ids").length !== 1
  )
    return reply({ error: "Provide catalog IDs." }, 400);
  const ids = params.get("ids")!.split(",");
  if (!ids.length || ids.length > 50 || ids.some((id) => !uuid.test(id)))
    return reply({ error: "Provide up to 50 valid catalog IDs." }, 400);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog is not configured." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    const now = new Date().toISOString();
    const result = await client
      .schema("catalog")
      .from("asset_versions")
      .select(
        "id,game_id,created_at,language_kind,language_tags,context_key,valid_from,valid_until,moderation_status,publication_status,storage_verified_at,rights_reference,asset_collections!inner(role,games!inner(status))",
      )
      .in("game_id", [...new Set(ids)])
      .eq("publication_status", "published")
      .eq("moderation_status", "approved")
      .not("storage_verified_at", "is", null)
      .lte("created_at", now)
      .eq("context_key", "base")
      .eq("asset_collections.games.status", "published")
      .in("asset_collections.role", ["capsule", "header", "hero"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(500);
    if (result.error)
      return reply({ error: "Artwork is temporarily unavailable." }, 503);
    const artwork = (result.data ?? []).flatMap((row) => {
      const collection = row.asset_collections as unknown as {
        role: string;
        games: { status: string };
      };
      if (
        !ids.includes(row.game_id) ||
        !uuid.test(row.id) ||
        !["global", "localized"].includes(row.language_kind) ||
        !Array.isArray(row.language_tags) ||
        !row.language_tags.every((tag: unknown) => typeof tag === "string") ||
        row.publication_status !== "published" ||
        row.moderation_status !== "approved" ||
        !row.storage_verified_at ||
        !row.rights_reference?.trim() ||
        collection?.games?.status !== "published" ||
        !["capsule", "header", "hero"].includes(collection.role) ||
        row.context_key !== "base" ||
        !Number.isFinite(Date.parse(row.created_at)) ||
        Date.parse(row.created_at) > Date.now() ||
        (row.valid_from &&
          (!Number.isFinite(Date.parse(row.valid_from)) ||
            Date.parse(row.valid_from) > Date.now())) ||
        (row.valid_until &&
          (!Number.isFinite(Date.parse(row.valid_until)) ||
            Date.parse(row.valid_until) <= Date.now()))
      )
        return [];
      return [
        {
          gameId: row.game_id,
          versionId: row.id,
          role: collection.role,
          languageKind: row.language_kind,
          languages: row.language_tags,
        },
      ];
    });
    return reply({ artwork });
  } catch {
    return reply({ error: "Artwork is temporarily unavailable." }, 503);
  }
}
