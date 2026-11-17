import { createHash } from "node:crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { verifyAdmin } from "./admin-access.ts";
import { objectKey } from "./asset-policy.ts";
import type { ApiEnvironment } from "./handler.ts";

export const deliveryLimit = 16 * 1024 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const formats: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  ico: "image/x-icon",
};
const error = (
  message: string,
  status: number,
  extra?: Record<string, string>,
) =>
  Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...extra,
      },
    },
  );
export const isDeliveryRoute = (path: string) =>
  /^\/api\/v1\/(admin\/)?asset-versions\/[^/]+\/(preview|download|thumbnail|display)$/.test(
    path,
  );

export async function readOriginal(
  client: S3Client,
  bucket: string,
  key: string,
  size: number,
  signal: AbortSignal,
) {
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { abortSignal: signal },
  );
  const body = result.Body;
  if (!body) throw Error("Missing body");
  const stop = () => {
    if ("destroy" in body && typeof body.destroy === "function")
      body.destroy(new Error("Storage read cancelled"));
  };
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  try {
    if (result.ContentLength !== size) throw Error("Storage length mismatch");
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      length += chunk.byteLength;
      if (signal.aborted || length > size || length > deliveryLimit)
        throw Error("Storage body rejected");
      chunks.push(chunk);
    }
    if (length !== size) throw Error("Incomplete original");
    return {
      bytes: Buffer.concat(chunks),
      contentType: result.ContentType ?? "",
    };
  } finally {
    signal.removeEventListener("abort", stop);
    if ("destroy" in body && typeof body.destroy === "function") body.destroy();
  }
}
type Reader = (
  key: string,
  size: number,
  signal: AbortSignal,
) => Promise<{ bytes: Uint8Array; contentType: string }>;
let cachedStorage: {
  account: string;
  accessKey: string;
  secret: string;
  client: S3Client;
} | null = null;
function reader(env: ApiEnvironment): Reader {
  if (
    !/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID ?? "") ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET ?? "") ||
    !env.R2_READ_ACCESS_KEY_ID ||
    !env.R2_READ_SECRET_ACCESS_KEY
  )
    throw Error("Read-only storage configuration unavailable");
  const account = env.R2_ACCOUNT_ID!,
    accessKey = env.R2_READ_ACCESS_KEY_ID,
    secret = env.R2_READ_SECRET_ACCESS_KEY;
  if (
    !cachedStorage ||
    cachedStorage.account !== account ||
    cachedStorage.accessKey !== accessKey ||
    cachedStorage.secret !== secret
  ) {
    cachedStorage = {
      account,
      accessKey,
      secret,
      client: new S3Client({
        region: "auto",
        endpoint: `https://${account}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: accessKey, secretAccessKey: secret },
        maxAttempts: 1,
      }),
    };
  }
  const client = cachedStorage.client;
  const bucket = env.R2_BUCKET!;
  return (key, size, signal) => readOriginal(client, bucket, key, size, signal);
}
// Derived bytes are process-local and bounded; access is checked before every hit.
const derivativeCache = new Map<string, { bytes: Buffer; mime: string }>();
let derivativeBytes = 0;
const derivativeLimit = 32 * 1024 * 1024;
function rememberDerivative(
  key: string,
  value: { bytes: Buffer; mime: string },
) {
  if (value.bytes.length > derivativeLimit) return;
  const existing = derivativeCache.get(key);
  if (existing) {
    derivativeBytes -= existing.bytes.length;
    derivativeCache.delete(key);
  }
  while (derivativeBytes + value.bytes.length > derivativeLimit) {
    const oldest = derivativeCache.keys().next().value;
    if (oldest === undefined) break;
    derivativeBytes -= derivativeCache.get(oldest)!.bytes.length;
    derivativeCache.delete(oldest);
  }
  derivativeCache.set(key, value);
  derivativeBytes += value.bytes.length;
}
function verifiedBytes(
  original: { bytes: Uint8Array; contentType: string },
  size: number,
  extension: string,
  mime: string,
  checksum: string,
) {
  const bytes = Buffer.from(original.bytes);
  const signature =
    extension === "png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : extension === "jpg"
        ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        : bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]));
  const typeMatches =
    original.contentType === mime ||
    (extension === "ico" &&
      original.contentType === "image/vnd.microsoft.icon");
  if (
    bytes.length !== size ||
    !typeMatches ||
    !signature ||
    createHash("sha256").update(bytes).digest("hex") !== checksum
  )
    throw Error("Original integrity could not be verified");
  return bytes;
}
export function byteRange(
  value: string | null,
  size: number,
): [number, number] | null {
  if (value === null) return [0, size - 1];
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const first = Number(match[1]);
  const last = Number(match[2]);
  if (
    (match[1] && !Number.isSafeInteger(first)) ||
    (match[2] && !Number.isSafeInteger(last))
  )
    return null;
  if (!match[1]) return last > 0 ? [Math.max(0, size - last), size - 1] : null;
  if (first >= size || (match[2] && last < first)) return null;
  return [first, match[2] ? Math.min(last, size - 1) : size - 1];
}
export async function deliveryRequest(
  request: Request,
  env: ApiEnvironment,
  read?: Reader,
): Promise<Response> {
  const url = new URL(request.url);
  const admin = url.pathname.startsWith("/api/v1/admin/");
  const id = url.pathname.split("/").at(-2)!;
  if (!["GET", "HEAD"].includes(request.method))
    return error("Method not allowed.", 405);
  if (!uuid.test(id) || url.search)
    return error(
      "A version identifier without query parameters is required.",
      400,
    );
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return error("Catalog is not configured.", 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    if (admin) {
      const access = await verifyAdmin(client, request);
      if (access instanceof Response) return access;
    }
    const result = await client
      .schema("catalog")
      .from("asset_versions")
      .select(
        "id,game_id,object_key,extension,checksum_sha256,byte_size,created_at,language_kind,language_tags,moderation_status,publication_status,storage_verified_at,rights_reference,asset_collections!inner(role,provenance,games!inner(status))",
      )
      .eq("id", id)
      .maybeSingle();
    if (result.error)
      return error("Original metadata is temporarily unavailable.", 503);
    const row = result.data;
    if (!row) return error("Original not found.", 404);
    const collection = row.asset_collections as unknown as {
      role: Parameters<typeof objectKey>[0]["role"];
      provenance: "official" | "community";
      games: { status: string };
    };
    if (
      !row.storage_verified_at ||
      (!admin &&
        (row.publication_status !== "published" ||
          row.moderation_status !== "approved" ||
          collection.games.status !== "published" ||
          !row.rights_reference?.trim() ||
          Date.parse(row.created_at) > Date.now()))
    )
      return error("Original not found.", 404);
    const size = Number(row.byte_size);
    const mime = formats[row.extension];
    if (
      !mime ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > deliveryLimit
    )
      return error(
        "This original is outside the supported image delivery limits.",
        422,
      );
    const canonical = objectKey({
      gameId: row.game_id,
      versionId: row.id,
      provenance: collection.provenance,
      role: collection.role,
      languageKind: row.language_kind,
      languages: row.language_tags,
      createdAt: row.created_at,
      extension: row.extension,
    });
    if (
      canonical !== row.object_key ||
      !/^[a-f0-9]{64}$/.test(row.checksum_sha256)
    )
      return error("Original integrity could not be verified.", 503);
    const variant = url.pathname.split("/").at(-1);
    if (variant === "thumbnail" || variant === "display") {
      const cacheKey = JSON.stringify([
        env.SUPABASE_URL,
        env.R2_ACCOUNT_ID,
        env.R2_BUCKET,
        canonical,
        row.checksum_sha256,
        variant,
      ]);
      const etag = `"derivative-v1-${variant}-${row.checksum_sha256}"`;
      const headers: Record<string, string> = {
        "Cache-Control": admin
          ? "private, no-store"
          : "private, max-age=300, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        ETag: etag,
      };
      if (
        !admin &&
        request.headers
          .get("If-None-Match")
          ?.split(",")
          .some((item) => item.trim() === etag || item.trim() === "*")
      )
        return new Response(null, { status: 304, headers });
      let image = derivativeCache.get(cacheKey);
      if (image) {
        derivativeCache.delete(cacheKey);
        derivativeCache.set(cacheKey, image);
      }
      if (!image) {
        const original = await (read ?? reader(env))(
          canonical,
          size,
          AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
        );
        const bytes = verifiedBytes(
          original,
          size,
          row.extension,
          mime,
          row.checksum_sha256,
        );
        if (row.extension === "ico") {
          // ICO can contain bitmap frames unsupported by the image processor.
          image = { bytes, mime };
        } else {
          const bound = variant === "thumbnail" ? 480 : 1280;
          const transformed = await sharp(bytes, {
            limitInputPixels: 40000000,
            failOn: "warning",
          })
            .rotate()
            .resize({
              width: bound,
              height: bound,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 80 })
            .toBuffer();
          image = { bytes: transformed, mime: "image/webp" };
        }
        rememberDerivative(cacheKey, image);
      }
      headers["Content-Type"] = image.mime;
      headers["Content-Length"] = String(image.bytes.length);
      headers["Content-Disposition"] = "inline";
      return new Response(
        request.method === "HEAD" ? null : new Uint8Array(image.bytes),
        { status: 200, headers },
      );
    }
    const etag = `"sha256-${row.checksum_sha256}"`;
    const ifRange = request.headers.get("If-Range");
    const requestedRange =
      request.method === "GET" && (!ifRange || ifRange === etag)
        ? request.headers.get("Range")
        : null;
    const range = byteRange(requestedRange, size);
    if (!range)
      return error("Requested byte range is not satisfiable.", 416, {
        "Content-Range": `bytes */${size}`,
      });
    const [start, end] = range;
    const partial = requestedRange !== null;
    const headers: Record<string, string> = {
      "Content-Type": mime,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `${url.pathname.endsWith("/download") ? "attachment" : "inline"}; filename="${row.id}.${row.extension}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      ETag: etag,
      ...(partial ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    };
    if (request.method === "HEAD")
      return new Response(null, { status: partial ? 206 : 200, headers });
    const original = await (read ?? reader(env))(
      canonical,
      size,
      AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    );
    const bytes = verifiedBytes(
      original,
      size,
      row.extension,
      mime,
      row.checksum_sha256,
    );
    let offset = start;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset > end) {
          controller.close();
          return;
        }
        const next = Math.min(offset + 65536, end + 1);
        controller.enqueue(bytes.subarray(offset, next));
        offset = next;
      },
    });
    return new Response(body, { status: partial ? 206 : 200, headers });
  } catch {
    return error("Original delivery is temporarily unavailable.", 503);
  }
}
