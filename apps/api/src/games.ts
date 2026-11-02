import { createClient } from "@supabase/supabase-js";
import { verifyAdmin } from "./admin-access.ts";
import { readJsonObject } from "./request-body.ts";
import type { ApiEnvironment } from "./handler.ts";
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function administrativeGames(
  request: Request,
  env: ApiEnvironment,
) {
  if (new URL(request.url).search)
    return reply({ error: "Unexpected game parameters." }, 400);
  if (!["GET", "POST", "PATCH"].includes(request.method))
    return reply({ error: "Method not allowed." }, 405);
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    return reply({ error: "Cross-origin request rejected." }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog connection unavailable." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const access = await verifyAdmin(client, request);
    if (access instanceof Response) return access;
    if (request.method === "PATCH") {
      if (!access.superAdmin)
        return reply({ error: "Super Admin permission required." }, 403);
      const body = await readJsonObject(request);
      if (body instanceof Response) return body;
      if (
        Object.keys(body).some(
          (k) => !["id", "expectedUpdatedAt", "status"].includes(k),
        ) ||
        typeof body.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          body.id,
        ) ||
        typeof body.expectedUpdatedAt !== "string" ||
        !Number.isFinite(Date.parse(body.expectedUpdatedAt)) ||
        !["draft", "published", "withdrawn"].includes(String(body.status))
      )
        return reply(
          { error: "Provide a game, its current revision and a valid status." },
          400,
        );
      const catalog = await client.rpc("admin_catalog", {
        p_actor: access.actor,
        p_session: access.sessionId,
      });
      if (catalog.error)
        return reply({ error: "Administrative catalog unavailable." }, 503);
      const game = catalog.data?.find((g: { id: string }) => g.id === body.id);
      if (!game)
        return reply(
          { error: "Game not found in the administrative catalog." },
          404,
        );
      const primary = game.localizations?.find(
        (l: { is_primary: boolean }) => l.is_primary,
      );
      if (!primary || !primary.source_reference?.trim())
        return reply(
          {
            error:
              "Review the primary title and its source before changing status.",
          },
          409,
        );
      if (
        game.updated_at !== body.expectedUpdatedAt ||
        game.status === body.status
      )
        return reply(
          { error: "Game changed. Refresh the game list before retrying." },
          409,
        );
      const saved = await client.rpc("admin_save_game", {
        p_actor: access.actor,
        p_session: access.sessionId,
        p_game: body.id,
        p_expected: body.expectedUpdatedAt,
        p_data: {
          title: primary.title,
          language: primary.language,
          description: primary.description,
          source_reference: primary.source_reference,
          confidence: primary.confidence,
          is_primary: true,
          approved:
            body.status === "published" ||
            primary.moderation_status === "approved",
          status: body.status,
        },
      });
      if (saved.error)
        return reply(
          {
            error:
              "Game update could not be confirmed. Refresh before retrying.",
          },
          saved.error.code === "P0001" ? 409 : 503,
        );
      return reply({ id: saved.data, status: body.status });
    }
    if (request.method === "GET") {
      const result = await client.rpc("admin_catalog", {
        p_actor: access.actor,
        p_session: access.sessionId,
      });
      if (result.error)
        return reply({ error: "Administrative catalog unavailable." }, 503);
      const games = (result.data ?? []).flatMap(
        (g: {
          id: string;
          status: string;
          updated_at: string;
          localizations: {
            title: string;
            language: string;
            is_primary: boolean;
            source_reference: string;
            moderation_status: string;
          }[];
        }) => {
          const title =
            g.localizations?.find((l) => l.is_primary) ?? g.localizations?.[0];
          return title
            ? [
                {
                  id: g.id,
                  title: title.title,
                  language: title.language,
                  status: g.status,
                  updatedAt: g.updated_at,
                  sourceReference: title.source_reference,
                  titleReview: title.moderation_status,
                },
              ]
            : [];
        },
      );
      return reply({ games });
    }
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    if (
      Object.keys(body).some(
        (k) =>
          !["title", "language", "source_reference", "description"].includes(k),
      ) ||
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.length > 300 ||
      typeof body.language !== "string" ||
      typeof body.source_reference !== "string" ||
      !body.source_reference.trim() ||
      body.source_reference.length > 2000 ||
      (body.description != null &&
        (typeof body.description !== "string" ||
          body.description.length > 1500))
    )
      return reply(
        { error: "Enter a title, language and source reference." },
        400,
      );
    let language: string;
    try {
      language = Intl.getCanonicalLocales(body.language)[0]?.toLowerCase();
      if (
        !language ||
        language === "und" ||
        !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(language)
      )
        throw Error();
    } catch {
      return reply({ error: "Enter a known language tag." }, 400);
    }
    const result = await client.rpc("create_game_draft", {
      p_actor: access.actor,
      p_session: access.sessionId,
      p_data: {
        title: body.title.trim(),
        language,
        source_reference: body.source_reference.trim(),
        description: body.description ?? null,
      },
    });
    if (result.error)
      return reply(
        {
          error:
            result.error.code === "23505"
              ? "A title with this name and language already exists. Check the game list before creating another."
              : "The game draft could not be created.",
        },
        result.error.code === "23505"
          ? 409
          : result.error.code === "22023"
            ? 400
            : result.error.code === "42501"
              ? 403
              : 503,
      );
    return reply(
      {
        game: {
          id: result.data,
          title: body.title.trim(),
          language,
          status: "draft",
        },
      },
      201,
    );
  } catch {
    return reply({ error: "Game management is temporarily unavailable." }, 503);
  }
}
