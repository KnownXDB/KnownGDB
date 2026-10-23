import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { assetRoles } from "@knowngdb/contracts";
import { languageScope, objectKey } from "./asset-policy.ts";
import { readJsonObject } from "./request-body.ts";
import { readOriginal } from "./asset-delivery.ts";
import { verifyAdmin } from "./admin-access.ts";
import type { ApiEnvironment } from "./handler.ts";

export const uploadLimit = 2 * 1024 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isSubmissionRoute = (path: string) =>
  path === "/api/v1/submissions" ||
  /^\/api\/v1\/submissions\/[^/]+\/original$/.test(path) ||
  /^\/api\/v1\/admin\/asset-versions\/[^/]+\/review$/.test(path);
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const media: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  ico: "image/x-icon",
};

// Structural framing and dimension limits precede storage. Moderation still
// verifies visual integrity, rights and suitability; no client MIME is trusted.
export function validateImage(bytes: Buffer, extension: string) {
  let width = 0,
    height = 0;
  if (!bytes.length || bytes.length > uploadLimit)
    throw Error("Image size exceeds the upload limit.");
  if (extension === "png") {
    if (
      bytes.length < 45 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.readUInt32BE(8) !== 13 ||
      bytes.toString("ascii", 12, 16) !== "IHDR" ||
      bytes.toString("ascii", bytes.length - 8, bytes.length - 4) !== "IEND" ||
      bytes.readUInt32BE(bytes.length - 12) !== 0
    )
      throw Error("Invalid PNG framing.");
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (extension === "jpg") {
    if (
      bytes.length < 12 ||
      bytes.readUInt16BE(0) !== 0xffd8 ||
      bytes.readUInt16BE(bytes.length - 2) !== 0xffd9
    )
      throw Error("Invalid JPEG framing.");
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at++] !== 255) throw Error("Invalid JPEG marker.");
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 0xda || marker === 0xd9) break;
      const length = bytes.readUInt16BE(at);
      if (length < 2 || at + length > bytes.length)
        throw Error("Invalid JPEG segment.");
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8) throw Error("Invalid JPEG frame.");
        height = bytes.readUInt16BE(at + 3);
        width = bytes.readUInt16BE(at + 5);
        break;
      }
      at += length;
    }
  } else if (extension === "ico") {
    if (bytes.length < 22 || bytes.readUInt32LE(0) !== 65536)
      throw Error("Invalid ICO header.");
    const count = bytes.readUInt16LE(4);
    if (!count || count > 256 || 6 + 16 * count > bytes.length)
      throw Error("Invalid ICO directory.");
    for (let i = 0; i < count; i++) {
      const at = 6 + 16 * i;
      const size = bytes.readUInt32LE(at + 8),
        offset = bytes.readUInt32LE(at + 12);
      if (!size || offset < 6 + 16 * count || offset + size > bytes.length)
        throw Error("Invalid ICO image bounds.");
    }
    width = height = 256;
  } else throw Error("Unsupported image format.");
  if (
    !width ||
    !height ||
    width > 16384 ||
    height > 16384 ||
    width * height > 40000000
  )
    throw Error("Image dimensions exceed the supported bounds.");
}

export function validateSubmission(
  input: Record<string, unknown>,
): Record<string, unknown> & { language_tags: string[] } {
  const allowed = [
    "game_id",
    "collection_id",
    "role",
    "credit_kind",
    "language_kind",
    "language_tags",
    "context_key",
    "valid_from",
    "valid_until",
    "extension",
    "checksum_sha256",
    "byte_size",
    "source_reference",
    "rights_reference",
  ];
  if (
    Object.keys(input).some((k) => !allowed.includes(k)) ||
    typeof input.game_id !== "string" ||
    !uuid.test(input.game_id) ||
    (input.collection_id != null &&
      (typeof input.collection_id !== "string" ||
        !uuid.test(input.collection_id))) ||
    typeof input.role !== "string" ||
    !assetRoles.includes(input.role as never) ||
    input.role === "trailer" ||
    !["personal", "official", "platform"].includes(String(input.credit_kind)) ||
    !["global", "localized"].includes(String(input.language_kind)) ||
    !Array.isArray(input.language_tags) ||
    !input.language_tags.every((t) => typeof t === "string") ||
    typeof input.extension !== "string" ||
    !media[input.extension] ||
    (input.extension === "ico" && input.role !== "client_icon") ||
    !Number.isSafeInteger(input.byte_size) ||
    Number(input.byte_size) < 1 ||
    Number(input.byte_size) > uploadLimit ||
    typeof input.checksum_sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(input.checksum_sha256) ||
    typeof input.context_key !== "string" ||
    input.context_key.length > 100 ||
    !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.context_key)
  )
    throw Error("Invalid submission metadata.");
  for (const key of ["source_reference", "rights_reference"])
    if (
      typeof input[key] !== "string" ||
      !(input[key] as string).trim() ||
      (input[key] as string).length > 2000
    )
      throw Error("Source and rights evidence are required.");
  const tags = (input.language_tags as string[]).map((t) =>
    Intl.getCanonicalLocales(t)[0]?.toLowerCase(),
  );
  languageScope(input.language_kind as "global" | "localized", tags);
  for (const key of ["valid_from", "valid_until"])
    if (
      input[key] != null &&
      (typeof input[key] !== "string" ||
        !Number.isFinite(Date.parse(input[key] as string)))
    )
      throw Error("Invalid validity date.");
  if (
    input.valid_from &&
    input.valid_until &&
    Date.parse(String(input.valid_until)) <=
      Date.parse(String(input.valid_from))
  )
    throw Error("Invalid validity interval.");
  return {
    ...input,
    language_tags: tags,
    collection_id: input.collection_id ?? null,
    valid_from: input.valid_from ?? null,
    valid_until: input.valid_until ?? null,
  };
}

export async function submissionRequest(
  request: Request,
  env: ApiEnvironment,
  storageFactory?: () => S3Client,
): Promise<Response> {
  const url = new URL(request.url),
    review = url.pathname.endsWith("/review"),
    original = url.pathname.endsWith("/original");
  if (url.search)
    return reply({ error: "Unexpected submission parameters." }, 400);
  if (
    request.method !== (original ? "PUT" : "POST") &&
    !(url.pathname === "/api/v1/submissions" && request.method === "GET")
  )
    return reply({ error: "Method not allowed." }, 405);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin)
    return reply({ error: "Cross-origin request rejected." }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog connection is not configured." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return reply({ error: "Sign in to submit an asset." }, 401);
    let actor: string, sessionId: string;
    if (review) {
      const access = await verifyAdmin(client, request);
      if (access instanceof Response) return access;
      ({ actor, sessionId } = access);
    } else {
      const identity = await client.auth.getUser(token);
      if (
        identity.error &&
        (!identity.error.status ||
          identity.error.status >= 500 ||
          identity.error.status === 429)
      )
        return reply(
          { error: "Identity verification is temporarily unavailable." },
          503,
        );
      if (identity.error || !identity.data.user?.email_confirmed_at)
        return reply(
          { error: "A confirmed account is required." },
          identity.error?.status && identity.error.status >= 500 ? 503 : 401,
        );
      actor = identity.data.user.id;
      try {
        sessionId = JSON.parse(
          Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
        ).session_id;
      } catch {
        return reply({ error: "An active session is required." }, 401);
      }
      if (!sessionId || !uuid.test(sessionId))
        return reply({ error: "An active session is required." }, 401);
      const active = await client.rpc("submission_check", {
        p_actor: actor,
        p_session: sessionId,
      });
      if (active.error)
        return reply(
          {
            error:
              "Submission service is unavailable. Its migration may be pending.",
          },
          503,
        );
      if (active.data !== true)
        return reply(
          {
            error:
              "An active session and public contributor profile are required.",
          },
          403,
        );
    }
    const rpcError = (code?: string) =>
      reply(
        {
          error:
            code === "40001"
              ? "State changed or submission expired. Refresh before retrying."
              : code === "42501"
                ? "You do not have permission for this submission."
                : code === "54000"
                  ? "Daily submission limit reached."
                  : "Submission could not be completed.",
        },
        code === "40001"
          ? 409
          : code === "42501"
            ? 403
            : code === "54000"
              ? 429
              : ["22023", "23514", "22P02"].includes(code ?? "")
                ? 400
                : code === "P0002"
                  ? 404
                  : 503,
      );
    if (review) {
      const id = url.pathname.split("/").at(-2)!;
      if (!uuid.test(id)) return reply({ error: "Invalid version." }, 400);
      const body = await readJsonObject(request);
      if (body instanceof Response) return body;
      if (
        Object.keys(body).some(
          (k) => !["expectedStatus", "status", "reason"].includes(k),
        ) ||
        !["submitted", "in_review"].includes(String(body.expectedStatus)) ||
        !["in_review", "approved", "rejected"].includes(String(body.status)) ||
        typeof body.reason !== "string" ||
        !body.reason.trim() ||
        body.reason.length > 2000
      )
        return reply({ error: "Review state and reason are required." }, 400);
      const result = await client.rpc("review_asset_version", {
        p_version: id,
        p_actor: actor,
        p_session: sessionId,
        p_expected: body.expectedStatus,
        p_status: body.status,
        p_reason: body.reason.trim(),
      });
      return result.error ? rpcError(result.error.code) : reply(result.data);
    }
    if (request.method === "GET") {
      const result = await client
        .schema("catalog")
        .from("asset_collections")
        .select("id,game_id,role,credit_kind,created_at")
        .eq("uploader_id", actor)
        .order("created_at", { ascending: false })
        .limit(100);
      return result.error
        ? reply({ error: "Your collections are unavailable." }, 503)
        : reply({ collections: result.data });
    }
    if (
      !env.R2_ACCOUNT_ID ||
      !env.R2_BUCKET ||
      !env.R2_UPLOAD_ACCESS_KEY_ID ||
      !env.R2_UPLOAD_SECRET_ACCESS_KEY
    )
      return reply(
        {
          error:
            "Image uploads are not configured. Existing read-only delivery is unaffected.",
        },
        503,
      );
    if (!original) {
      const body = await readJsonObject(request);
      if (body instanceof Response) return body;
      let metadata;
      try {
        metadata = validateSubmission(body);
      } catch (error) {
        return reply(
          {
            error: error instanceof Error ? error.message : "Invalid metadata.",
          },
          400,
        );
      }
      const result = await client.rpc("reserve_asset_submission", {
        p_actor: actor,
        p_session: sessionId,
        p_data: metadata,
      });
      return result.error
        ? rpcError(result.error.code)
        : reply(result.data, 201);
    }
    const id = url.pathname.split("/").at(-2)!;
    if (!uuid.test(id)) return reply({ error: "Submission not found." }, 404);
    const found = await client
      .schema("catalog")
      .from("asset_submissions")
      .select("id,metadata,object_key,created_at,expires_at,version_id")
      .eq("id", id)
      .eq("uploader_id", actor)
      .maybeSingle();
    if (found.error)
      return reply({ error: "Submission lookup unavailable." }, 503);
    if (!found.data) return reply({ error: "Submission not found." }, 404);
    const intent = found.data;
    if (Date.parse(intent.expires_at) <= Date.now() && !intent.version_id)
      return reply({ error: "Submission expired." }, 409);
    const d = validateSubmission(intent.metadata);
    const expected = objectKey({
      gameId: String(d.game_id),
      versionId: id,
      provenance: d.credit_kind === "official" ? "official" : "community",
      role: d.role as never,
      languageKind: d.language_kind as "global" | "localized",
      languages: d.language_tags,
      createdAt: intent.created_at,
      extension: String(d.extension),
    });
    if (expected !== intent.object_key)
      return reply({ error: "Submission identity mismatch." }, 503);
    if (request.headers.get("Content-Type") !== media[String(d.extension)])
      return reply(
        { error: "Image content type does not match the submission." },
        415,
      );
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "An original image is required." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > uploadLimit || size > Number(d.byte_size)) {
          await reader.cancel();
          return reply({ error: "Original exceeds its reserved size." }, 413);
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks),
      hash = createHash("sha256").update(bytes).digest("hex");
    if (size !== d.byte_size || hash !== d.checksum_sha256)
      return reply(
        { error: "Original does not match the reserved size and checksum." },
        400,
      );
    try {
      validateImage(bytes, String(d.extension));
    } catch (error) {
      return reply(
        { error: error instanceof Error ? error.message : "Invalid image." },
        400,
      );
    }
    const storage =
      storageFactory?.() ??
      new S3Client({
        region: "auto",
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_UPLOAD_ACCESS_KEY_ID,
          secretAccessKey: env.R2_UPLOAD_SECRET_ACCESS_KEY,
        },
        maxAttempts: 1,
      });
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(20000),
    ]);
    try {
      if (!intent.version_id) {
        try {
          await storage.send(
            new PutObjectCommand({
              Bucket: env.R2_BUCKET,
              Key: expected,
              Body: bytes,
              ContentLength: size,
              ContentType: media[String(d.extension)],
              IfNoneMatch: "*",
            }),
            { abortSignal: signal },
          );
        } catch (error) {
          if (
            (error as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode !== 412
          )
            throw error;
        }
      }
      const stored = await readOriginal(
        storage,
        env.R2_BUCKET,
        expected,
        size,
        signal,
      );
      if (createHash("sha256").update(stored.bytes).digest("hex") !== hash)
        throw Error("Stored original verification failed");
      const result = await client.rpc("complete_asset_submission", {
        p_id: id,
        p_actor: actor,
        p_session: sessionId,
        p_hash: hash,
        p_size: size,
      });
      return result.error ? rpcError(result.error.code) : reply(result.data);
    } finally {
      storage.destroy();
    }
  } catch {
    return reply(
      {
        error:
          "Submission is temporarily unavailable. Retrying the same reserved upload is safe.",
      },
      503,
    );
  }
}
