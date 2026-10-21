import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { S3Client } from "@aws-sdk/client-s3";
import {
  byteRange,
  deliveryLimit,
  deliveryRequest,
  readOriginal,
} from "../apps/api/src/asset-delivery.ts";
import { handleRequest } from "../apps/api/src/handler.ts";
import { issueSession } from "../apps/api/src/session.ts";
import { objectKey } from "../apps/api/src/asset-policy.ts";

const actor = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const game = "00000000-0000-4000-8000-000000000003";
const session = "00000000-0000-4000-8000-000000000004";
const authorization = `Bearer fixture.${Buffer.from(JSON.stringify({ session_id: session })).toString("base64url")}.fixture`;
// A minimal real PNG, kept textual rather than as a committed binary fixture.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4c8AAAAASUVORK5CYII=",
  "base64",
);
const date = "2026-01-01T00:00:00Z";
const key = objectKey({
  gameId: game,
  versionId: id,
  provenance: "official",
  role: "logo",
  languageKind: "localized",
  languages: ["en"],
  createdAt: date,
  extension: "png",
});
const publicUrl = `http://localhost/api/v1/asset-versions/${id}/preview`;
const adminUrl = `http://localhost/api/v1/admin/asset-versions/${id}/preview`;
async function fixture() {
  const state = {
    role: "super_admin",
    session: true,
    reads: 0,
    corrupt: false,
    contentType: "image/png",
    missing: false,
    row: {
      id,
      game_id: game,
      object_key: key,
      extension: "png",
      checksum_sha256: createHash("sha256").update(png).digest("hex"),
      byte_size: png.length,
      created_at: date,
      language_kind: "localized",
      language_tags: ["en"],
      moderation_status: "approved",
      publication_status: "published",
      storage_verified_at: date,
      rights_reference: "Private evidence",
      asset_collections: {
        role: "logo",
        provenance: "official",
        games: { status: "published" },
      },
    },
  };
  const server = createServer((req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname;
    const send = (data: unknown) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (path === "/auth/v1/user")
      return send({ id: actor, email_confirmed_at: date });
    if (path.endsWith("/admin_members")) return send([{ role: state.role }]);
    if (path.endsWith("/rpc/admin_check")) return send(state.session);
    if (path.endsWith("/asset_versions"))
      return send(state.missing ? null : state.row);
    res.writeHead(500);
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    state,
    env: {
      SUPABASE_URL: `http://127.0.0.1:${address.port}`,
      SUPABASE_SECRET_KEY: "fixture",
    },
    read: async (k: string, size: number) => {
      state.reads++;
      assert.equal(k, key);
      assert.equal(size, png.length);
      return {
        bytes: state.corrupt ? Buffer.alloc(png.length) : png,
        contentType: state.contentType,
      };
    },
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}
test("published originals are verified and delivered with safe headers; partial downloads preserve bytes", async () => {
  const f = await fixture();
  try {
    const r = await deliveryRequest(new Request(publicUrl), f.env, f.read);
    assert.equal(r.status, 200);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), png);
    assert.equal(r.headers.get("Content-Type"), "image/png");
    assert.equal(r.headers.get("Cache-Control"), "private, no-store");
    assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
    assert.match(r.headers.get("Content-Security-Policy")!, /sandbox/);
    assert.equal(r.headers.get("Cross-Origin-Resource-Policy"), "same-origin");
    assert.ok(!JSON.stringify([...r.headers]).includes(key));
    const ranged = await deliveryRequest(
      new Request(publicUrl.replace("/preview", "/download"), {
        headers: { Range: "bytes=8-12" },
      }),
      f.env,
      f.read,
    );
    assert.equal(ranged.status, 206);
    assert.equal(
      ranged.headers.get("Content-Range"),
      `bytes 8-12/${png.length}`,
    );
    assert.match(
      ranged.headers.get("Content-Disposition")!,
      /^attachment; filename="[a-f0-9-]+\.png"$/,
    );
    assert.deepEqual(
      Buffer.from(await ranged.arrayBuffer()),
      png.subarray(8, 13),
    );
    const fallback = await deliveryRequest(
      new Request(publicUrl, {
        headers: { Range: "bytes=8-12", "If-Range": '"stale"' },
      }),
      f.env,
      f.read,
    );
    assert.equal(fallback.status, 200);
    assert.equal((await fallback.arrayBuffer()).byteLength, png.length);
  } finally {
    await f.close();
  }
});
test("private/unapproved/unverified/unpublished game originals remain undiscoverable without reading R2", async () => {
  const f = await fixture();
  try {
    for (const change of [
      "private",
      "review",
      "storage",
      "game",
      "rights",
      "future",
      "missing",
    ]) {
      const saved = structuredClone(f.state.row);
      f.state.missing = change === "missing";
      if (change === "private") f.state.row.publication_status = "private";
      if (change === "review") f.state.row.moderation_status = "rejected";
      if (change === "storage") f.state.row.storage_verified_at = "";
      if (change === "game")
        f.state.row.asset_collections.games.status = "draft";
      if (change === "rights") f.state.row.rights_reference = "";
      if (change === "future") f.state.row.created_at = "2999-01-01T00:00:00Z";
      const r = await deliveryRequest(new Request(publicUrl), f.env, f.read);
      assert.equal(r.status, 404, change);
      assert.equal(f.state.reads, 0);
      f.state.row = saved;
    }
  } finally {
    await f.close();
  }
});
test("administrators can review private verified originals; active identity, membership and session are required", async () => {
  const f = await fixture();
  try {
    f.state.row.publication_status = "private";
    f.state.row.moderation_status = "in_review";
    assert.equal(
      (await deliveryRequest(new Request(adminUrl), f.env, f.read)).status,
      401,
    );
    f.state.role = "moderator";
    const request = () => new Request(adminUrl, { headers: { authorization } });
    const r = await deliveryRequest(request(), f.env, f.read);
    assert.equal(r.status, 200);
    await r.arrayBuffer();
    assert.equal(f.state.reads, 1);
    f.state.session = false;
    assert.equal((await deliveryRequest(request(), f.env, f.read)).status, 401);
    f.state.session = true;
    f.state.role = "viewer";
    assert.equal((await deliveryRequest(request(), f.env, f.read)).status, 403);
    assert.equal(f.state.reads, 1);
    assert.equal(
      (
        await handleRequest(
          new Request(adminUrl, {
            headers: { "Sec-Fetch-Site": "cross-site" },
          }),
          f.env,
        )
      ).status,
      403,
    );
  } finally {
    await f.close();
  }
});
test("integrity, canonical ownership, content types and delivery bounds fail closed", async () => {
  const f = await fixture();
  try {
    f.state.corrupt = true;
    assert.equal(
      (await deliveryRequest(new Request(publicUrl), f.env, f.read)).status,
      503,
    );
    f.state.corrupt = false;
    f.state.contentType = "text/html";
    assert.equal(
      (await deliveryRequest(new Request(publicUrl), f.env, f.read)).status,
      503,
    );
    f.state.contentType = "image/png";
    const before = f.state.reads;
    f.state.row.object_key = "foreign-game/private.png";
    assert.equal(
      (await deliveryRequest(new Request(publicUrl), f.env, f.read)).status,
      503,
    );
    assert.equal(f.state.reads, before);
    f.state.row.object_key = key;
    f.state.row.byte_size = deliveryLimit + 1;
    assert.equal(
      (await deliveryRequest(new Request(publicUrl), f.env, f.read)).status,
      422,
    );
    assert.equal(f.state.reads, before);
  } finally {
    await f.close();
  }
});
test("HEAD, invalid ranges, query injection and absent storage configuration perform no original read", async () => {
  const f = await fixture();
  try {
    const head = await deliveryRequest(
      new Request(publicUrl, {
        method: "HEAD",
        headers: { Range: "bytes=0-1" },
      }),
      f.env,
      f.read,
    );
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("Content-Length"), String(png.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    const bad = await deliveryRequest(
      new Request(publicUrl, { headers: { Range: "bytes=999-" } }),
      f.env,
      f.read,
    );
    assert.equal(bad.status, 416);
    assert.equal(bad.headers.get("Content-Range"), `bytes */${png.length}`);
    assert.equal(
      (
        await deliveryRequest(
          new Request(publicUrl + "?key=foreign"),
          f.env,
          f.read,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await deliveryRequest(
          new Request(publicUrl, { method: "POST" }),
          f.env,
          f.read,
        )
      ).status,
      405,
    );
    assert.equal(f.state.reads, 0);
    assert.equal(
      (await deliveryRequest(new Request(publicUrl), f.env)).status,
      503,
    );
  } finally {
    await f.close();
  }
});
test("byte ranges reject multiple, malformed, inverted, unsafe and empty ranges", () => {
  assert.deepEqual(byteRange("bytes=-3", 10), [7, 9]);
  assert.deepEqual(byteRange("bytes=5-", 10), [5, 9]);
  assert.deepEqual(byteRange("bytes=0-100", 10), [0, 9]);
  for (const value of [
    "bytes=-0",
    "bytes=-",
    "bytes=3-2",
    "bytes=0-1,3-4",
    "bytes=9007199254740992-",
    "items=0-1",
  ])
    assert.equal(byteRange(value, 10), null, value);
});
test("administrative HEAD accepts a valid same-origin cookie without a write Origin header", async () => {
  const f = await fixture();
  try {
    const env = {
      ...f.env,
      SESSION_SECRET: Buffer.alloc(32, 9).toString("base64url"),
    };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const issued = issueSession(
      new Request(adminUrl),
      env,
      {
        access_token: authorization.slice(7),
        refresh_token: "fixture-refresh",
        expires_at: expires,
      } as Parameters<typeof issueSession>[2],
      Response.json({}),
    );
    const cookie = issued.headers.get("Set-Cookie")!.split(";")[0];
    const response = await handleRequest(
      new Request(adminUrl, { method: "HEAD", headers: { Cookie: cookie } }),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Length"), String(png.length));
    assert.equal((await response.arrayBuffer()).byteLength, 0);
    assert.equal(f.state.reads, 0);
  } finally {
    await f.close();
  }
});
test("S3 original reader sends only a bounded GetObject and rejects mismatched lengths", async () => {
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    assert.equal(req.method, "GET");
    assert.equal(req.url, "/bucket/" + key + "?x-id=GetObject");
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": png.length,
    });
    res.end(png);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const client = new S3Client({
    region: "auto",
    endpoint: `http://127.0.0.1:${address.port}`,
    forcePathStyle: true,
    credentials: { accessKeyId: "fixture", secretAccessKey: "fixture" },
    maxAttempts: 1,
  });
  try {
    const result = await readOriginal(
      client,
      "bucket",
      key,
      png.length,
      AbortSignal.timeout(5000),
    );
    assert.deepEqual(result.bytes, png);
    await assert.rejects(
      readOriginal(
        client,
        "bucket",
        key,
        png.length + 1,
        AbortSignal.timeout(5000),
      ),
    );
    assert.equal(requests, 2);
  } finally {
    client.destroy();
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
});
