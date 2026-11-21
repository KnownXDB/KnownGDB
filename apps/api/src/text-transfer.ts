import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { hashApiKey } from "./api-keys.ts";
import { readJsonObject } from "./request-body.ts";
import type { ApiEnvironment } from "./handler.ts";
export const textTransferBodyLimit = 512 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest = /^[0-9a-f]{64}$/;
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function textTransferRequest(
  request: Request,
  env: ApiEnvironment,
) {
  if (request.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  if (new URL(request.url).search)
    return reply({ error: "Unexpected parameters." }, 400);
  const key = request.headers
    .get("authorization")
    ?.match(/^Bearer (kgsvc_[A-Za-z0-9_-]{43})$/)?.[1];
  if (!key) return reply({ error: "Integration credential required." }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Transfer service unavailable." }, 503);
  const body = await readJsonObject(request, textTransferBodyLimit);
  if (body instanceof Response) return body;
  const { action, id, clientId, byteLength, sha256, index, data } = body;
  let bytes: Buffer | null = null;
  if (action === "create") {
    if (
      Object.keys(body).sort().join(",") !==
        "action,byteLength,clientId,sha256" ||
      typeof clientId !== "string" ||
      !uuid.test(clientId) ||
      !Number.isSafeInteger(byteLength) ||
      Number(byteLength) < 0 ||
      Number(byteLength) > 67108864 ||
      typeof sha256 !== "string" ||
      !digest.test(sha256)
    )
      return reply({ error: "Invalid transfer manifest." }, 400);
  } else if (action === "chunk") {
    if (
      Object.keys(body).sort().join(",") !== "action,data,id,index,sha256" ||
      typeof id !== "string" ||
      !uuid.test(id) ||
      !Number.isSafeInteger(index) ||
      Number(index) < 0 ||
      Number(index) > 255 ||
      typeof data !== "string" ||
      data.length > 349528 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        data,
      ) ||
      typeof sha256 !== "string" ||
      !digest.test(sha256)
    )
      return reply({ error: "Invalid transfer chunk." }, 400);
    bytes = Buffer.from(data, "base64");
    if (
      !bytes.length ||
      bytes.length > 262144 ||
      bytes.toString("base64") !== data ||
      createHash("sha256").update(bytes).digest("hex") !== sha256
    )
      return reply({ error: "Invalid transfer chunk." }, 400);
  } else if (action === "complete" || action === "delete") {
    if (
      Object.keys(body).sort().join(",") !== "action,id" ||
      typeof id !== "string" ||
      !uuid.test(id)
    )
      return reply({ error: "Invalid transfer request." }, 400);
  } else return reply({ error: "Invalid transfer request." }, 400);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    const result = await client.rpc("stage_text_transfer", {
      p_hash: hashApiKey(key),
      p_action: action,
      p_transfer: id ?? null,
      p_client: clientId ?? null,
      p_size: byteLength ?? null,
      p_digest: action === "create" ? sha256 : null,
      p_index: index ?? null,
      p_data: bytes ? `\\x${bytes.toString("hex")}` : null,
      p_chunk_digest: action === "chunk" ? sha256 : null,
    });
    if (result.error)
      return reply(
        { error: "Transfer operation failed." },
        ["23505", "40001"].includes(result.error.code)
          ? 409
          : result.error.code === "22023"
            ? 400
            : 503,
      );
    if (result.data?.status === "denied")
      return reply(
        { error: "Integration credential invalid or revoked." },
        401,
      );
    if (result.data?.status === "limited")
      return Response.json(
        { error: "Rate limit reached." },
        {
          status: 429,
          headers: { "Retry-After": "60", "Cache-Control": "no-store" },
        },
      );
    return reply(result.data);
  } catch {
    return reply({ error: "Transfer service unavailable." }, 503);
  }
}
