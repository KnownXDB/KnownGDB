import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { ApiEnvironment } from "./handler.ts";
import { readJsonObject } from "./request-body.ts";

export const keyPath = "/api/v1/account/api-keys";
export const consumerPath = "/api/v1/consumer/games";
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export const hashApiKey = (key: string) =>
  createHash("sha256").update(key).digest("hex");
export async function apiKeysRequest(request: Request, env: ApiEnvironment) {
  if (!["GET", "POST", "DELETE"].includes(request.method))
    return reply({ error: "Method not allowed." }, 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Key service is not configured." }, 503);
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return reply({ error: "Authentication required." }, 401);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const verified = await client.auth.getUser(token);
    if (verified.error || !verified.data.user?.email_confirmed_at)
      return reply(
        { error: "A confirmed account is required." },
        verified.error &&
          (!verified.error.status ||
            verified.error.status >= 500 ||
            verified.error.status === 429)
          ? 503
          : 401,
      );
    let session: string | undefined;
    try {
      session = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString(),
      ).session_id;
    } catch {
      /* Reject sessionless credentials. */
    }
    if (!session || !/^[0-9a-f-]{36}$/i.test(session))
      return reply({ error: "An active account session is required." }, 401);
    let body: Record<string, unknown> = {};
    if (request.method !== "GET") {
      const parsed = await readJsonObject(request);
      if (parsed instanceof Response) return parsed;
      body = parsed;
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const id = typeof body.id === "string" ? body.id : "";
    if (
      request.method === "POST" &&
      (!name ||
        name.length > 80 ||
        /[\p{Cc}\p{Cf}<>]/u.test(name) ||
        Object.keys(body).some((k) => k !== "name"))
    )
      return reply({ error: "Provide a name of 1 to 80 characters." }, 400);
    if (
      request.method === "DELETE" &&
      (!/^[0-9a-f-]{36}$/i.test(id) ||
        Object.keys(body).some((k) => k !== "id"))
    )
      return reply({ error: "Provide a valid key ID." }, 400);
    const key =
      request.method === "POST"
        ? `kgdb_${randomBytes(32).toString("base64url")}`
        : null;
    const result = await client.rpc("account_api_keys", {
      p_actor: verified.data.user.id,
      p_session: session,
      p_action: request.method,
      p_id: id || null,
      p_name: name || null,
      p_hash: key ? hashApiKey(key) : null,
      p_prefix: key?.slice(0, 13) ?? null,
    });
    if (result.error)
      return reply(
        {
          error: "Key operation is unavailable. Verify your session and retry.",
        },
        result.error.code === "28000" ? 401 : 503,
      );
    return reply(key ? { ...result.data, key } : result.data, key ? 201 : 200);
  } catch {
    return reply({ error: "Key service is temporarily unavailable." }, 503);
  }
}

export async function verifyConsumerKey(
  request: Request,
  env: ApiEnvironment,
): Promise<Response | null> {
  if (request.method !== "GET")
    return reply({ error: "Method not allowed." }, 405);
  const key = request.headers
    .get("authorization")
    ?.match(/^Bearer (kgdb_[A-Za-z0-9_-]{43})$/)?.[1];
  if (!key) return reply({ error: "A consumption API key is required." }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Key verification is unavailable." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await client.rpc("consume_catalog_api_key", {
      p_hash: hashApiKey(key),
    });
    if (result.error)
      return reply({ error: "Key verification is unavailable." }, 503);
    return result.data === true
      ? null
      : reply({ error: "API key is invalid, expired or revoked." }, 401);
  } catch {
    return reply({ error: "Key verification is unavailable." }, 503);
  }
}
