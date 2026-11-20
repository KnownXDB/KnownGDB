import { createClient } from "@supabase/supabase-js";
import { verifyAdmin } from "./admin-access.ts";
import { readJsonObject } from "./request-body.ts";
import type { ApiEnvironment } from "./handler.ts";

type Identity = {
  provider: string;
  namespace: string;
  kind: string;
  value: string;
};
type Candidate = {
  game_id: string;
  evidence_status: string;
  valid_from?: string | null;
  valid_until?: string | null;
};
const token = /^[a-z0-9]+([._-][a-z0-9]+)*$/;
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

export function parseIdentities(
  body: Record<string, unknown>,
): Identity[] | null {
  if (
    Object.keys(body).some((key) => key !== "identities") ||
    !Array.isArray(body.identities) ||
    body.identities.length < 1 ||
    body.identities.length > 20
  )
    return null;
  const identities: Identity[] = [];
  for (const entry of body.identities) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.keys(entry).sort().join(",") !== "kind,namespace,provider,value"
    )
      return null;
    const { provider, namespace, kind, value } = entry as Record<
      string,
      unknown
    >;
    if (
      typeof provider !== "string" ||
      typeof namespace !== "string" ||
      typeof kind !== "string" ||
      typeof value !== "string" ||
      provider.length > 80 ||
      namespace.length > 80 ||
      kind.length > 80 ||
      !token.test(provider) ||
      !token.test(namespace) ||
      !token.test(kind) ||
      !value.trim() ||
      value.length > 500 ||
      /[\u0000-\u001f\u007f]/u.test(value)
    )
      return null;
    identities.push({
      provider,
      namespace,
      kind,
      value: value.trim().toLowerCase(),
    });
  }
  return identities;
}
export function classifyCandidates(rows: Candidate[], truncated: boolean) {
  const ids = [
    ...new Set(
      rows
        .filter((row) => row.evidence_status !== "rejected")
        .map((row) => row.game_id),
    ),
  ];
  if (
    truncated ||
    ids.length > 1 ||
    rows.some((row) => row.evidence_status === "conflicted")
  )
    return { status: "conflict", gameId: null };
  if (!ids.length) return { status: "not_found", gameId: null };
  if (
    rows.some(
      (row) =>
        row.game_id === ids[0] &&
        row.evidence_status !== "verified" &&
        row.evidence_status !== "rejected",
    )
  )
    return { status: "review", gameId: null };
  if (
    rows.some(
      (row) =>
        row.game_id === ids[0] &&
        row.evidence_status === "verified" &&
        ((row.valid_from &&
          (!Number.isFinite(Date.parse(row.valid_from)) ||
            Date.parse(row.valid_from) > Date.now())) ||
          (row.valid_until &&
            (!Number.isFinite(Date.parse(row.valid_until)) ||
              Date.parse(row.valid_until) <= Date.now()))),
    )
  )
    return { status: "review", gameId: null };
  return { status: "matched", gameId: ids[0] };
}
export async function resolveIdentities(request: Request, env: ApiEnvironment) {
  if (request.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog connection unavailable." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    const access = await verifyAdmin(client, request);
    if (access instanceof Response) return access;
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    const identities = parseIdentities(body);
    if (!identities)
      return reply({ error: "Provide 1 to 20 valid identities." }, 400);
    const results = [];
    for (const identity of identities) {
      const result = await client
        .schema("catalog")
        .from("external_identities")
        .select("game_id,evidence_status,valid_from,valid_until")
        .eq("provider", identity.provider)
        .eq("namespace", identity.namespace)
        .eq("identifier_kind", identity.kind)
        .eq("normalized_value", identity.value)
        .limit(101);
      if (result.error)
        return reply({ error: "Identity resolution unavailable." }, 503);
      results.push({
        identity,
        ...classifyCandidates(
          result.data ?? [],
          (result.data?.length ?? 0) > 100,
        ),
      });
    }
    return reply({ results });
  } catch {
    return reply({ error: "Identity resolution unavailable." }, 503);
  }
}
export const isGameIdentitiesRoute = (path: string) =>
  /^\/api\/v1\/admin\/games\/[^/]+\/identities$/.test(path);

export async function gameIdentities(request: Request, env: ApiEnvironment) {
  if (request.method !== "GET")
    return reply({ error: "Method not allowed." }, 405);
  const url = new URL(request.url);
  const game = url.pathname.split("/")[5];
  if (
    url.search ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      game,
    )
  )
    return reply({ error: "A valid catalog item ID is required." }, 400);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog connection unavailable." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    const access = await verifyAdmin(client, request);
    if (access instanceof Response) return access;
    const result = await client
      .schema("catalog")
      .from("external_identities")
      .select(
        "id,provider,namespace,identifier_kind,value,scope,region,locale,evidence_status,source_kind,source_reference,last_verified_at",
      )
      .eq("game_id", game)
      .order("id")
      .limit(101);
    if (result.error)
      return reply({ error: "Identity list unavailable." }, 503);
    const rows = result.data ?? [];
    return reply({
      identities: rows.slice(0, 100),
      truncated: rows.length > 100,
    });
  } catch {
    return reply({ error: "Identity list unavailable." }, 503);
  }
}
export async function recordGogIdentity(request: Request, env: ApiEnvironment) {
  if (request.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog connection unavailable." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    const access = await verifyAdmin(client, request);
    if (access instanceof Response) return access;
    if (!access.superAdmin)
      return reply({ error: "Super Admin permission required." }, 403);
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    const { gameId, productId, source, reason } = body;
    if (
      Object.keys(body).sort().join(",") !== "gameId,productId,reason,source" ||
      typeof gameId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        gameId,
      ) ||
      typeof productId !== "string" ||
      !/^[0-9]{1,20}$/.test(productId) ||
      typeof source !== "string" ||
      source.length > 2000 ||
      !/^https:\/\/[^/@\s]+(?:\/[^\s]*)?$/.test(source) ||
      typeof reason !== "string" ||
      !reason.trim() ||
      reason.length > 2000
    )
      return reply(
        {
          error: "Provide a valid game, product ID, source and review reason.",
        },
        400,
      );
    const result = await client.rpc("admin_record_gog_product_identity", {
      p_actor: access.actor,
      p_session: access.sessionId,
      p_game: gameId,
      p_product_id: productId,
      p_source: source,
      p_reason: reason,
    });
    if (result.error)
      return reply(
        {
          error:
            result.error.code === "23505"
              ? "The product ID is already associated with another catalog item."
              : "Identity could not be saved.",
        },
        result.error.code === "23505" ? 409 : 503,
      );
    return reply(result.data);
  } catch {
    return reply({ error: "Identity could not be saved." }, 503);
  }
}
