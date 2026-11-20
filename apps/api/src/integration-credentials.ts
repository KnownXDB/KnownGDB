import { randomBytes } from "node:crypto";
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
export async function integrationCredentials(
  request: Request,
  env: ApiEnvironment,
) {
  if (!["GET", "POST", "DELETE"].includes(request.method))
    return reply({ error: "Method not allowed." }, 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Credential service unavailable." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    const access = await verifyAdmin(client, request);
    if (access instanceof Response) return access;
    if (!access.superAdmin)
      return reply({ error: "Super Admin permission required." }, 403);
    let body: Record<string, unknown> = {};
    if (request.method !== "GET") {
      const parsed = await readJsonObject(request);
      if (parsed instanceof Response) return parsed;
      body = parsed;
    }
    const creating = request.method === "POST",
      revoking = request.method === "DELETE";
    if (
      (creating &&
        (Object.keys(body).sort().join(",") !== "expiresAt,name,reason" ||
          typeof body.name !== "string" ||
          !body.name.trim() ||
          body.name.length > 80 ||
          /[\p{Cc}\p{Cf}<>]/u.test(body.name) ||
          typeof body.expiresAt !== "string" ||
          !Number.isFinite(Date.parse(body.expiresAt)))) ||
      (revoking &&
        (Object.keys(body).sort().join(",") !== "id,reason" ||
          typeof body.id !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            body.id,
          ))) ||
      ((creating || revoking) &&
        (typeof body.reason !== "string" ||
          !body.reason.trim() ||
          body.reason.length > 2000))
    )
      return reply({ error: "Invalid credential request." }, 400);
    const key = creating
      ? `kgsvc_${randomBytes(32).toString("base64url")}`
      : null;
    const result = await client.rpc("manage_integration_credential", {
      p_actor: access.actor,
      p_session: access.sessionId,
      p_action: creating ? "create" : revoking ? "revoke" : "list",
      p_id: revoking ? body.id : null,
      p_name: creating ? body.name : null,
      p_hash: key ? hashApiKey(key) : null,
      p_prefix: key?.slice(0, 13) ?? null,
      p_expires: creating ? body.expiresAt : null,
      p_reason: creating || revoking ? body.reason : null,
    });
    if (result.error)
      return reply(
        { error: "Credential operation unavailable." },
        result.error.code === "22023" ? 400 : 503,
      );
    return reply(key ? { ...result.data, key } : result.data, key ? 201 : 200);
  } catch {
    return reply({ error: "Credential operation unavailable." }, 503);
  }
}
