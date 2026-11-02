import { createClient } from "@supabase/supabase-js";
import { verifyAdmin } from "./admin-access.ts";
import { readJsonObject } from "./request-body.ts";
import { fetchEAStorePreview } from "./ea.ts";
import type { ApiEnvironment } from "./handler.ts";

const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

export async function eaPreviewRequest(
  request: Request,
  env: ApiEnvironment,
): Promise<Response> {
  if (request.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog is not configured." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    const access = await verifyAdmin(client, request);
    if (access instanceof Response) return access;
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    const seriesSlug =
      typeof body.seriesSlug === "string" ? body.seriesSlug.trim() : "";
    const gameSlug =
      typeof body.gameSlug === "string" ? body.gameSlug.trim() : "";
    const preview = await fetchEAStorePreview(seriesSlug, gameSlug, {
      signal: request.signal,
    });
    return reply({ preview });
  } catch (error) {
    return reply(
      {
        error:
          error instanceof Error
            ? error.message
            : "EA official page preview is unavailable.",
      },
      502,
    );
  }
}

export async function eaConfirmRequest(
  request: Request,
  env: ApiEnvironment,
): Promise<Response> {
  if (request.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog is not configured." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    const access = await verifyAdmin(client, request);
    if (access instanceof Response) return access;
    if (!access.superAdmin)
      return reply(
        {
          error:
            "Super Admin permission is required to persist official identities.",
        },
        403,
      );
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    const gameId = typeof body.gameId === "string" ? body.gameId.trim() : "";
    const seriesSlug =
      typeof body.seriesSlug === "string" ? body.seriesSlug.trim() : "";
    const gameSlug =
      typeof body.gameSlug === "string" ? body.gameSlug.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        gameId,
      )
    )
      return reply(
        { error: "A valid KnownGDB catalog item ID is required." },
        400,
      );
    if (!reason) return reply({ error: "A review reason is required." }, 400);
    const preview = await fetchEAStorePreview(seriesSlug, gameSlug, {
      signal: request.signal,
    });
    const stored = await client.rpc("admin_save_ea_observation", {
      p_actor: access.actor,
      p_session: access.sessionId,
      p_game: gameId,
      p_series_slug: preview.seriesSlug,
      p_game_slug: preview.gameSlug,
      p_title: preview.title,
      p_source_reference: preview.url,
      p_observed_at: preview.fetchedAt,
      p_reason: reason,
    });
    if (stored.error)
      return reply({ error: "EA observation could not be persisted." }, 503);
    return reply({ persisted: stored.data, preview });
  } catch (error) {
    return reply(
      {
        error:
          error instanceof Error
            ? error.message
            : "EA observation could not be persisted.",
      },
      502,
    );
  }
}
