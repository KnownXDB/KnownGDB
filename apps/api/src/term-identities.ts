import { createClient } from "@supabase/supabase-js";
import { verifyAdmin } from "./admin-access.ts";
import { hashApiKey } from "./api-keys.ts";
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
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[1-9][0-9]{0,9}$/.test(id);
export async function termIdentityRequest(
  request: Request,
  env: ApiEnvironment,
) {
  if (request.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  if (new URL(request.url).search)
    return reply({ error: "Unexpected parameters." }, 400);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog connection unavailable." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    const admin = new URL(request.url).pathname.startsWith("/api/v1/admin/");
    let access: Awaited<ReturnType<typeof verifyAdmin>> | null = null;
    if (admin) {
      access = await verifyAdmin(client, request);
      if (access instanceof Response) return access;
      if (!access.superAdmin)
        return reply({ error: "Super Admin permission required." }, 403);
    } else {
      const key = request.headers
        .get("authorization")
        ?.match(/^Bearer (kgsvc_[A-Za-z0-9_-]{43})$/)?.[1];
      if (!key)
        return reply({ error: "Integration credential required." }, 401);
      const auth = await client.rpc("consume_integration_credential", {
        p_hash: hashApiKey(key),
        p_scope: "identity:resolve",
      });
      if (auth.error)
        return reply({ error: "Credential verification unavailable." }, 503);
      if (auth.data === "limited")
        return Response.json(
          { error: "Rate limit reached." },
          {
            status: 429,
            headers: { "Retry-After": "60", "Cache-Control": "no-store" },
          },
        );
      if (auth.data !== "allowed")
        return reply(
          { error: "Integration credential invalid or revoked." },
          401,
        );
    }
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    if (admin && access && !(access instanceof Response)) {
      const { termId, kind, externalId, source, reason } = body;
      if (
        Object.keys(body).sort().join(",") !==
          "externalId,kind,reason,source,termId" ||
        typeof termId !== "string" ||
        !uuid.test(termId) ||
        typeof kind !== "string" ||
        !["organization", "platform"].includes(kind) ||
        !validId(externalId) ||
        typeof source !== "string" ||
        source.length > 2000 ||
        !/^https:\/\/[^/@\s]+(?:\/[^\s]*)?$/.test(source) ||
        typeof reason !== "string" ||
        !reason.trim() ||
        reason.length > 2000
      )
        return reply({ error: "Invalid term identity." }, 400);
      const result = await client.rpc("admin_record_term_identity", {
        p_actor: access.actor,
        p_session: access.sessionId,
        p_term: termId,
        p_kind: kind,
        p_external_id: externalId,
        p_source: source,
        p_reason: reason,
      });
      if (result.error)
        return reply(
          {
            error:
              result.error.code === "23505"
                ? "External identity already belongs to another term."
                : "Term identity could not be saved.",
          },
          result.error.code === "23505" ? 409 : 503,
        );
      return reply(result.data);
    }
    if (
      Object.keys(body).join(",") !== "items" ||
      !Array.isArray(body.items) ||
      body.items.length < 1 ||
      body.items.length > 20
    )
      return reply({ error: "Provide 1 to 20 term identities." }, 400);
    const entries: { kind: string; externalId: string }[] = [];
    for (const value of body.items) {
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).sort().join(",") !== "externalId,kind" ||
        typeof value.kind !== "string" ||
        !["organization", "platform"].includes(value.kind) ||
        !validId(value.externalId)
      )
        return reply({ error: "Invalid term identity." }, 400);
      entries.push({ kind: value.kind, externalId: value.externalId });
    }
    if (
      new Set(entries.map((entry) => `${entry.kind}:${entry.externalId}`))
        .size !== entries.length
    )
      return reply({ error: "Duplicate term identities." }, 400);
    const results = [];
    for (const entry of entries) {
      const result = await client
        .schema("catalog")
        .from("term_external_identities")
        .select("term_id")
        .eq("provider", "igdb")
        .eq("term_kind", entry.kind)
        .eq("external_id", entry.externalId)
        .maybeSingle();
      if (result.error)
        return reply({ error: "Term identity resolution unavailable." }, 503);
      results.push({
        ...entry,
        termId: result.data?.term_id ?? null,
        status: result.data ? "matched" : "not_found",
      });
    }
    return reply({ results });
  } catch {
    return reply({ error: "Term identity service unavailable." }, 503);
  }
}
