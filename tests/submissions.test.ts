import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { handleRequest } from "../apps/api/src/handler.ts";
import {
  submissionRequest,
  validateImage,
  validateSubmission,
  uploadLimit,
} from "../apps/api/src/submissions.ts";
import { objectKey } from "../apps/api/src/asset-policy.ts";
const actor = "00000000-0000-4000-8000-000000000001",
  session = "00000000-0000-4000-8000-000000000002",
  game = "00000000-0000-4000-8000-000000000003",
  id = "00000000-0000-4000-8000-000000000004";
const token = `fixture.${Buffer.from(JSON.stringify({ session_id: session })).toString("base64url")}.fixture`;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
  "base64",
);
const metadata = {
  game_id: game,
  role: "logo",
  credit_kind: "personal",
  language_kind: "localized",
  language_tags: ["en"],
  context_key: "base",
  extension: "png",
  byte_size: png.length,
  checksum_sha256: createHash("sha256").update(png).digest("hex"),
  source_reference: "Contributor source",
  rights_reference: "Distribution permission",
};
async function fixture() {
  const state = {
    storageWrites: 0,
    reads: 0,
    completed: 0,
    active: true,
    corrupt: false,
    found: true,
    calls: [] as Record<string, unknown>[],
    ownerFilter: false,
  };
  const key = objectKey({
    gameId: game,
    versionId: id,
    provenance: "community",
    role: "logo",
    languageKind: "localized",
    languages: ["en"],
    createdAt: "2026-10-22T00:00:00Z",
    extension: "png",
  });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://localhost");
    const send = (d: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(d));
    };
    if (url.pathname === "/auth/v1/user")
      return send({ id: actor, email_confirmed_at: "2026-01-01T00:00:00Z" });
    if (url.pathname.endsWith("/admin_members"))
      return send([{ role: "moderator" }]);
    if (url.pathname.endsWith("/rpc/admin_check")) return send(state.active);
    if (url.pathname.endsWith("/rpc/submission_check"))
      return send(state.active);
    if (url.pathname.includes("/rpc/")) {
      let raw = "";
      for await (const c of req) raw += c;
      const d = JSON.parse(raw);
      state.calls.push(d);
      if (url.pathname.endsWith("complete_asset_submission")) {
        state.completed++;
        return send({ versionId: id });
      }
      return send({ id });
    }
    if (url.pathname.endsWith("/asset_submissions")) {
      state.ownerFilter = url.searchParams.get("uploader_id") === `eq.${actor}`;
      return send(
        state.found
          ? {
              id,
              metadata,
              object_key: key,
              created_at: "2026-10-22T00:00:00Z",
              expires_at: "2099-01-01T00:00:00Z",
              version_id: null,
            }
          : null,
      );
    }
    if (url.pathname.endsWith("/asset_collections")) {
      assert.equal(url.searchParams.get("uploader_id"), `eq.${actor}`);
      return send([]);
    }
    if (req.method === "PUT") {
      assert.equal(url.pathname, `/bucket/${key}`);
      assert.equal(req.headers["if-none-match"], "*");
      let bytes = Buffer.alloc(0);
      for await (const c of req) bytes = Buffer.concat([bytes, c]);
      assert.deepEqual(bytes, png);
      state.storageWrites++;
      if (state.storageWrites > 1) {
        res.writeHead(412, { "Content-Type": "application/xml" });
        res.end("<Error><Code>PreconditionFailed</Code></Error>");
      } else {
        res.writeHead(200, { ETag: '"fixture"' });
        res.end();
      }
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/bucket/")) {
      state.reads++;
      const body = state.corrupt ? Buffer.alloc(png.length) : png;
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": body.length,
      });
      res.end(body);
      return;
    }
    send({ error: "Unexpected fixture request" }, 500);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    state,
    env: {
      SUPABASE_URL: origin,
      SUPABASE_SECRET_KEY: "fixture",
      R2_ACCOUNT_ID: "fixture",
      R2_BUCKET: "bucket",
      R2_UPLOAD_ACCESS_KEY_ID: "fixture",
      R2_UPLOAD_SECRET_ACCESS_KEY: "fixture",
    },
    storage: () =>
      new S3Client({
        region: "auto",
        endpoint: origin,
        forcePathStyle: true,
        credentials: { accessKeyId: "fixture", secretAccessKey: "fixture" },
        maxAttempts: 1,
      }),
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
const request = (
  suffix = "",
  body: BodyInit = JSON.stringify(metadata),
  method = "POST",
  contentType = "application/json",
) =>
  new Request(`http://localhost/api/v1/submissions${suffix}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      Origin: "http://localhost",
    },
    ...(method !== "GET" ? { body } : {}),
  });
test("submission validation rejects mass assignment, unsafe language/media and image framing/dimension bounds", () => {
  assert.doesNotThrow(() => validateImage(png, "png"));
  assert.equal(
    validateSubmission({ ...metadata, language_tags: ["es-UY"] })
      .language_tags[0],
    "es-uy",
  );
  for (const patch of [
    { uploader_id: actor },
    { publication_status: "published" },
    { object_key: "external/key" },
    { language_tags: ["en", "EN"] },
    { extension: "svg" },
    { role: "trailer" },
    { extension: "ico" },
    { byte_size: uploadLimit + 1 },
    { valid_from: "2026-02-01", valid_until: "2026-01-01" },
  ])
    assert.throws(() => validateSubmission({ ...metadata, ...patch }));
  const bomb = Buffer.from(png);
  bomb.writeUInt32BE(20000, 16);
  assert.throws(() => validateImage(bomb, "png"));
  assert.throws(() => validateImage(Buffer.from("<svg/>"), "png"));
  assert.throws(() => validateImage(png.subarray(0, 30), "png"));
});
test("submission API enforces identity, session, ownership, CSRF and server-derived reservation identity", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (
        await handleRequest(
          new Request("http://localhost/api/v1/submissions", {
            method: "POST",
          }),
          f.env,
        )
      ).status,
      401,
    );
    const cross = request();
    cross.headers.set("Origin", "https://invalid.example");
    assert.equal((await handleRequest(cross, f.env)).status, 403);
    assert.equal((await handleRequest(request(), f.env)).status, 201);
    assert.equal(f.state.calls[0].p_actor, actor);
    assert.equal(f.state.calls[0].p_session, session);
    assert.equal(
      (await handleRequest(request("", undefined, "GET"), f.env)).status,
      200,
    );
    f.state.active = false;
    assert.equal((await handleRequest(request(), f.env)).status, 403);
    assert.equal(f.state.storageWrites, 0);
  } finally {
    await f.close();
  }
});
test("original upload uses create-only canonical writes, real read-back integrity and retry-safe database completion", async () => {
  const f = await fixture();
  try {
    const send = () =>
      submissionRequest(
        request(`/${id}/original`, png, "PUT", "image/png"),
        f.env,
        f.storage,
      );
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 200);
    assert.equal(f.state.storageWrites, 2);
    assert.equal(f.state.reads, 2);
    assert.equal(f.state.completed, 2);
    assert.ok(f.state.ownerFilter);
    f.state.corrupt = true;
    assert.equal((await send()).status, 503);
    assert.equal(f.state.completed, 2);
    const wrong = Buffer.from(png);
    wrong[20] ^= 1;
    assert.equal(
      (
        await submissionRequest(
          request(`/${id}/original`, wrong, "PUT", "image/png"),
          f.env,
          f.storage,
        )
      ).status,
      400,
    );
    f.state.found = false;
    assert.equal((await send()).status, 404);
  } finally {
    await f.close();
  }
});
test("moderation API derives reviewer identity and rejects malformed transitions before RPC", async () => {
  const f = await fixture();
  try {
    const url = `http://localhost/api/v1/admin/asset-versions/${id}/review`;
    const make = (data: unknown) =>
      new Request(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
    assert.equal(
      (
        await handleRequest(
          make({
            expectedStatus: "submitted",
            status: "in_review",
            reason: "Check attribution",
          }),
          f.env,
        )
      ).status,
      200,
    );
    assert.equal(f.state.calls[0].p_actor, actor);
    assert.equal(f.state.calls[0].p_status, "in_review");
    assert.equal(
      (
        await handleRequest(
          make({
            expectedStatus: "submitted",
            status: "approved",
            reason: "",
            reviewer: actor,
          }),
          f.env,
        )
      ).status,
      400,
    );
  } finally {
    await f.close();
  }
});

test("original upload rejects mismatched media and stops oversized streams before any storage write", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (
        await submissionRequest(
          request(`/${id}/original`, png, "PUT", "image/svg+xml"),
          f.env,
          f.storage,
        )
      ).status,
      415,
    );
    let chunks = 0,
      cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunks++;
        controller.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const streamed = new Request(
      `http://localhost/api/v1/submissions/${id}/original`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/png",
        },
        body,
        ...({ duplex: "half" } as object),
      },
    );
    assert.equal(
      (await submissionRequest(streamed, f.env, f.storage)).status,
      413,
    );
    assert.ok(chunks <= 2);
    assert.ok(cancelled);
    assert.equal(f.state.storageWrites, 0);
    const ico = Buffer.alloc(22 + png.length);
    ico.writeUInt16LE(1, 2);
    ico.writeUInt16LE(1, 4);
    ico[6] = ico[7] = 1;
    ico.writeUInt32LE(png.length, 14);
    ico.writeUInt32LE(22, 18);
    png.copy(ico, 22);
    assert.doesNotThrow(() => validateImage(ico, "ico"));
    ico.writeUInt32LE(ico.length + 1, 18);
    assert.throws(() => validateImage(ico, "ico"));
  } finally {
    await f.close();
  }
});
