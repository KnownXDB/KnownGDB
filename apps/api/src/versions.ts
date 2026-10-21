import { verifyAdmin } from "./admin-access.ts";
import { createClient } from "@supabase/supabase-js";
import type { ApiEnvironment } from "./handler.ts";
import type { VersionSummary } from "@knowngdb/contracts";

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
export const isVersionRoute = (path: string) =>
  path === "/api/v1/admin/asset-versions" ||
  /^\/api\/v1\/admin\/asset-versions\/[^/]+\/publication$/.test(path) ||
  /^\/api\/v1\/games\/[^/]+\/asset-versions$/.test(path);
export async function versionRequest(
  request: Request,
  env: ApiEnvironment,
): Promise<Response> {
  const url = new URL(request.url);
  const admin = url.pathname.startsWith("/api/v1/admin/");
  const write = url.pathname.endsWith("/publication");
  if (request.method !== (write ? "POST" : "GET"))
    return reply({ error: "Method not allowed." }, 405);
  const versionId = write ? url.pathname.split("/").at(-2)! : null;
  const gameId = admin
    ? url.searchParams.get("gameId")
    : url.pathname.split("/").at(-2)!;
  if ((gameId && !uuid.test(gameId)) || (versionId && !uuid.test(versionId)))
    return reply({ error: "A canonical identifier is required." }, 400);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog is not configured." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    let actor: string | undefined;
    let sessionId: string | undefined;
    let superAdmin = false;
    if (admin) {
      const access = await verifyAdmin(client, request);
      if (access instanceof Response) return access;
      ({ actor, sessionId, superAdmin } = access);
      if (write && !superAdmin)
        return reply({ error: "Super Admin permission required." }, 403);
    }
    if (write) {
      if (url.search)
        return reply({ error: "Unexpected publication parameters." }, 400);
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        return reply({ error: "JSON body required." }, 415);
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 4096)
        return reply({ error: "Request is too large." }, 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply({ error: "Invalid JSON." }, 400);
      }
      if (
        !body ||
        Array.isArray(body) ||
        typeof body !== "object" ||
        Object.keys(body).some(
          (key) =>
            !["expectedStatus", "publicationStatus", "reason"].includes(key),
        ) ||
        !["private", "published"].includes(body.expectedStatus) ||
        !["private", "published"].includes(body.publicationStatus) ||
        typeof body.reason !== "string" ||
        !body.reason.trim() ||
        body.reason.trim().length > 2000 ||
        /[\p{Cf}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(
          body.reason,
        )
      )
        return reply(
          {
            error:
              "Provide valid publication states and a reason of 1 to 2000 characters.",
          },
          400,
        );
      const result = await client.rpc("set_asset_version_publication", {
        p_version: versionId,
        p_actor: actor,
        p_session: sessionId,
        p_expected: body.expectedStatus,
        p_status: body.publicationStatus,
        p_reason: body.reason.trim(),
      });
      if (result.error) {
        const status =
          (
            {
              "40001": 409,
              "23514": 409,
              "42501": 403,
              "28000": 401,
              P0002: 404,
              "22023": 400,
            } as Record<string, number>
          )[result.error.code] ?? 503;
        return reply(
          {
            error:
              status === 409
                ? "Version changed or is not eligible. Reload and review its state."
                : status === 401
                  ? "Sign in again to continue."
                  : status === 403
                    ? "Publication permission required."
                    : status === 404
                      ? "Version not found."
                      : "Publication could not be completed.",
          },
          status,
        );
      }
      return reply(result.data);
    }
    const allowed = admin ? ["gameId", "limit", "cursor"] : ["limit", "cursor"];
    if (
      [...url.searchParams.keys()].some(
        (key) =>
          !allowed.includes(key) || url.searchParams.getAll(key).length !== 1,
      )
    )
      return reply({ error: "Unexpected history parameters." }, 400);
    const limitText = url.searchParams.get("limit") ?? "25";
    if (!/^[1-9]\d?$/.test(limitText) || Number(limitText) > 50)
      return reply({ error: "Limit must be between 1 and 50." }, 400);
    const limit = Number(limitText);
    let cursor: { createdAt: string; id: string } | null = null;
    if (url.searchParams.has("cursor")) {
      try {
        const value = url.searchParams.get("cursor")!;
        if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) throw Error();
        cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
        if (
          !cursor ||
          !uuid.test(cursor.id) ||
          typeof cursor.createdAt !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|\+00:00)$/.test(
            cursor.createdAt,
          ) ||
          !Number.isFinite(Date.parse(cursor.createdAt)) ||
          new Date(cursor.createdAt).toISOString().slice(0, 10) !==
            cursor.createdAt.slice(0, 10)
        )
          throw Error();
      } catch {
        return reply({ error: "Invalid history cursor." }, 400);
      }
    }
    if (!admin) {
      const game = await client
        .schema("catalog")
        .from("games")
        .select("id")
        .eq("id", gameId!)
        .eq("status", "published")
        .maybeSingle();
      if (game.error)
        return reply({ error: "Catalog is temporarily unavailable." }, 503);
      if (!game.data) return reply({ error: "Game not found." }, 404);
    }
    let query = client
      .schema("catalog")
      .from("asset_versions")
      .select(
        "id,game_id,collection_id,revision_number,created_at,language_kind,language_tags,context_key,valid_from,valid_until,moderation_status,publication_status,storage_verified_at,rights_reference,change_reason,asset_collections!inner(role,provenance,credit_kind,contributor_profiles(display_name),games!inner(status))",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (gameId) query = query.eq("game_id", gameId);
    if (!admin)
      query = query
        .eq("publication_status", "published")
        .eq("moderation_status", "approved")
        .not("storage_verified_at", "is", null)
        .lte("created_at", new Date().toISOString())
        .eq("asset_collections.games.status", "published");
    if (cursor)
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    const result = await query;
    if (result.error)
      return reply(
        { error: "Version history is temporarily unavailable." },
        503,
      );
    const rows = result.data ?? [];
    const versions: VersionSummary[] = rows.slice(0, limit).map((row) => {
      const collection = row.asset_collections as unknown as {
        role: VersionSummary["role"];
        provenance: VersionSummary["provenance"];
        credit_kind: VersionSummary["credit"]["kind"];
        contributor_profiles: { display_name: string } | null;
        games: { status: string };
      };
      return {
        id: row.id,
        gameId: row.game_id,
        collectionId: row.collection_id,
        revision: row.revision_number,
        role: collection.role,
        provenance: collection.provenance,
        credit: {
          kind: collection.credit_kind,
          label:
            collection.credit_kind === "official"
              ? "Official asset"
              : collection.credit_kind === "platform"
                ? "Created by KnownGDB"
                : (collection.contributor_profiles?.display_name ??
                  "Contributor"),
        },
        languageKind: row.language_kind,
        languages: row.language_tags,
        context: row.context_key,
        createdAt: row.created_at,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        moderation: row.moderation_status,
        published: row.publication_status === "published",
        rightsVerified: Boolean(row.rights_reference?.trim()),
        storageVerified: Boolean(row.storage_verified_at),
        canPublish:
          admin &&
          superAdmin &&
          collection.games.status === "published" &&
          row.moderation_status === "approved" &&
          Boolean(row.storage_verified_at) &&
          Boolean(row.rights_reference?.trim()) &&
          Date.parse(row.created_at) <= Date.now(),
        ...(admin ? { changeReason: row.change_reason } : {}),
      };
    });
    // Rights references themselves remain private; fail closed on malformed legacy data.
    const safeVersions = admin
      ? versions
      : versions.filter((version) => version.rightsVerified);
    const last = rows[Math.min(limit, rows.length) - 1];
    return reply({
      versions: safeVersions,
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({ createdAt: last.created_at, id: last.id }),
            ).toString("base64url")
          : null,
    });
  } catch {
    return reply({ error: "Version service is temporarily unavailable." }, 503);
  }
}
