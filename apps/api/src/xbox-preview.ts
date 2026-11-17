import { createClient } from "@supabase/supabase-js";
import { verifyAdmin } from "./admin-access.ts";
import { readJsonObject } from "./request-body.ts";
import { fetchXboxStorePreview } from "./xbox.ts";
import { storePreviewFailure } from "./store-errors.ts";
import type { ApiEnvironment } from "./handler.ts";

const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

export async function xboxPreviewRequest(
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
    const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";
    const preview = await fetchXboxStorePreview(storeId, {
      signal: request.signal,
    });
    return reply({ preview });
  } catch (error) {
    const failure = storePreviewFailure(
      error,
      "Xbox / Microsoft Store",
      "Xbox Store preview is unavailable.",
    );
    return reply(failure.body, failure.status);
  }
}

export async function xboxConfirmRequest(
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
    const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";
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
    const preview = await fetchXboxStorePreview(storeId, {
      signal: request.signal,
    });
    const stored = await client.rpc("admin_save_xbox_observation", {
      p_actor: access.actor,
      p_session: access.sessionId,
      p_game: gameId,
      p_store_id: preview.storeId,
      p_title: preview.title,
      p_source_reference: preview.url,
      p_observed_at: preview.fetchedAt,
      p_reason: reason,
    });
    if (stored.error)
      return reply({ error: "Xbox observation could not be persisted." }, 503);
    return reply({ persisted: stored.data, preview });
  } catch (error) {
    return reply(
      {
        error:
          error instanceof Error
            ? error.message
            : "Xbox observation could not be persisted.",
      },
      502,
    );
  }
}
