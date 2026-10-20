import { createClient } from "@supabase/supabase-js";
import { assetRoles, type GameSummary } from "@knowngdb/contracts";
import { creditOptions } from "./asset-policy.ts";
import { accountPaths, accountRequest } from "./account.ts";
import { withSession } from "./session.ts";
import { isVersionRoute, versionRequest } from "./versions.ts";

export interface ApiEnvironment {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  ACCOUNT_RECOVERY_URL?: string;
  SESSION_SECRET?: string;
}
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function handleRequest(
  request: Request,
  env: ApiEnvironment = process.env,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const path = requestUrl.pathname;
  if (
    (accountPaths.includes(path) || path.startsWith("/api/v1/admin/")) &&
    requestUrl.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(requestUrl.hostname)
  )
    return reply({ error: "HTTPS is required for account access." }, 403);
  if (
    [
      "/api/v1/account/profile",
      "/api/v1/account/session",
      "/api/v1/account/logout",
      "/api/v1/admin/session",
    ].includes(path) ||
    (isVersionRoute(path) && path.startsWith("/api/v1/admin/"))
  )
    return withSession(request, env, (authenticated) =>
      routeRequest(authenticated, env),
    );
  return routeRequest(request, env);
}
async function routeRequest(
  request: Request,
  env: ApiEnvironment,
): Promise<Response> {
  const url = new URL(request.url);
  if (isVersionRoute(url.pathname)) return versionRequest(request, env);
  if (accountPaths.includes(url.pathname)) return accountRequest(request, env);
  if (request.method !== "GET")
    return reply({ error: "Method not allowed." }, 405);
  if (url.pathname === "/api/v1/health")
    return reply({
      service: "KnownGDB API",
      status: "ok",
      catalogConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY),
    });
  if (url.pathname === "/api/v1/asset-roles")
    return reply({ roles: assetRoles });
  if (!["/api/v1/games", "/api/v1/admin/session"].includes(url.pathname))
    return reply({ error: "Not found." }, 404);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog connection is not configured." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (url.pathname === "/api/v1/admin/session") {
      const token = request.headers
        .get("authorization")
        ?.match(/^Bearer (\S+)$/)?.[1];
      if (!token) return reply({ error: "Authentication required." }, 401);
      const {
        data: { user },
        error,
      } = await client.auth.getUser(token);
      if (
        error &&
        (!error.status || error.status >= 500 || error.status === 429)
      )
        return reply(
          { error: "Identity verification is temporarily unavailable." },
          503,
        );
      if (error || !user)
        return reply({ error: "Authentication required." }, 401);
      const membership = await client
        .schema("catalog")
        .from("admin_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("active", true)
        .maybeSingle();
      if (membership.error)
        return reply(
          { error: "Administrative authorization is unavailable." },
          503,
        );
      if (!membership.data)
        return reply({ error: "Administrative permission required." }, 403);
      const role = membership.data.role;
      if (!["super_admin", "moderator"].includes(role))
        return reply({ error: "Administrative permission required." }, 403);
      return reply({ role, publicationIdentities: creditOptions(role, true) });
    }
    const query = (url.searchParams.get("q") ?? "").trim();
    if (query.length > 120)
      return reply({ error: "Search is limited to 120 characters." }, 400);
    let lookup = client
      .schema("catalog")
      .from("game_localizations")
      .select("game_id,title,language,games!inner(status)")
      .eq("moderation_status", "approved")
      .eq("games.status", "published")
      .order("title")
      .limit(50);
    if (query)
      lookup = lookup.ilike("title", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error } = await lookup;
    if (error)
      return reply({ error: "Catalog is temporarily unavailable." }, 503);
    const games: GameSummary[] = (data ?? []).map((row) => ({
      id: row.game_id,
      title: row.title,
      language: row.language,
    }));
    return reply({ games });
  } catch {
    return reply({ error: "Service is temporarily unavailable." }, 503);
  }
}
