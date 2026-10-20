import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { S3Client } from "@aws-sdk/client-s3";
import {
  planLegacyBackfill,
  type BackfillInput,
} from "../scripts/plan-legacy-backfill.ts";
import {
  executeLegacyBackfill,
  type StoredBody,
} from "../scripts/execute-legacy-backfill.ts";
import { R2BackfillStorage } from "../scripts/r2-backfill-storage.ts";

function fixture() {
  const id = "00000000-0000-4000-8000-000000000001";
  const game = "00000000-0000-4000-8000-000000000002";
  const key = `originals/${game}/${id}.png`;
  const bytes = Buffer.from("Synthetic original");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const body: StoredBody = {
    bytes,
    contentType: "image/png",
    metadata: { sha256: hash },
  };
  const input: BackfillInput = {
    checkedAt: new Date().toISOString(),
    assets: [
      {
        id,
        game_id: game,
        object_key: key,
        role: "logo",
        language_kind: "global",
        language_tags: [],
        checksum_sha256: hash,
        byte_size: bytes.length,
        mime_type: "image/png",
        provenance: "official",
        rendition: "original",
        created_at: "2026-10-01T00:00:00Z",
        valid_from: null,
        valid_until: null,
        source_reference: "https://example.invalid/source",
        rights_reference: "Synthetic rights fixture",
        moderation_status: "approved",
        publication_status: "published",
        reviewed_by: id,
        reviewed_at: "2026-10-02T00:00:00Z",
      },
    ],
    uploads: [
      {
        object_key: key,
        game_id: game,
        actor_id: id,
        completed_at: "2026-10-01T00:00:00Z",
        expires_at: "2026-10-02T00:00:00Z",
        metadata: { byte_size: bytes.length, checksum_sha256: hash },
      },
    ],
    members: [{ user_id: id, active: true, role: "super_admin" }],
    existingCollectionIds: [],
    existingVersionIds: [],
    objects: [
      {
        key,
        size: bytes.length,
        custom_metadata: body.metadata,
        http_metadata: { contentType: body.contentType },
      },
    ],
    observations: [{ key, size: bytes.length, sha256: hash }],
  };
  const plan = planLegacyBackfill(input);
  const stored = new Map([[key, structuredClone(body)]]);
  const storage = {
    async read(name: string) {
      assert.ok(stored.has(name));
      return structuredClone(stored.get(name)!);
    },
    async createOnly(name: string, value: StoredBody) {
      if (stored.has(name)) throw Error("Precondition failed");
      stored.set(name, structuredClone(value));
    },
  };
  return { input, plan, body, key, stored, storage };
}

test("executor verifies both bodies and registers once without changing originals or publication", async () => {
  const f = fixture();
  const stages: string[] = [];
  const result = await executeLegacyBackfill(
    f.plan,
    f.input,
    f.storage,
    async (receipts) => {
      assert.equal(receipts.length, 1);
      assert.ok(receipts[0].verifiedAt);
      assert.equal(receipts[0].version.publication_status, "private");
      return { imported: 1, publicationStatus: "private" };
    },
    (event) => stages.push(event.stage),
  );
  assert.equal(result.imported, 1);
  assert.deepEqual(stages, [
    "copy-started",
    "copy-created",
    "copy-verified",
    "database-committed",
  ]);
  assert.deepEqual(f.stored.get(f.key), structuredClone(f.body));
});

test("executor stops on plan drift, source/destination corruption or a concurrent destination", async () => {
  for (const mode of [
    "plan-drift",
    "source-corruption",
    "destination-corruption",
    "concurrent-destination",
  ]) {
    const f = fixture();
    let registered = false;
    if (mode === "plan-drift")
      f.plan.entries[0].version.rights_reference = "Changed";
    if (mode === "source-corruption")
      f.stored.get(f.key)!.bytes = Buffer.from("Changed source");
    if (mode === "concurrent-destination")
      f.stored.set(f.plan.entries[0].copy.targetKey, structuredClone(f.body));
    const originalRead = f.storage.read;
    f.storage.read = async (key) => {
      const body = await originalRead(key);
      if (mode === "destination-corruption" && key !== f.key)
        body.bytes = Buffer.from("Changed destination");
      return body;
    };
    await assert.rejects(
      executeLegacyBackfill(f.plan, f.input, f.storage, async () => {
        registered = true;
        return { imported: 1, publicationStatus: "private" };
      }),
    );
    assert.equal(registered, false);
    assert.ok(f.stored.has(f.key));
  }
});

test("failed database registration retains verified private copies for explicit recovery", async () => {
  const f = fixture();
  await assert.rejects(
    executeLegacyBackfill(f.plan, f.input, f.storage, async () => {
      throw Error("Uncertain database outcome");
    }),
  );
  assert.equal(f.stored.size, 2);
  assert.deepEqual(f.stored.get(f.key), structuredClone(f.body));
});

test("S3 adapter transmits atomic create-only condition and independently reads bytes over HTTP", async () => {
  const f = fixture();
  let stored: Buffer | undefined;
  let metadata = "";
  const server = createServer(async (req, res) => {
    if (req.method === "PUT") {
      assert.equal(req.headers["if-none-match"], "*");
      if (stored) {
        res.writeHead(412, { "content-type": "application/xml" });
        res.end("<Error><Code>PreconditionFailed</Code></Error>");
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      stored = Buffer.concat(chunks);
      metadata = String(req.headers["x-amz-meta-sha256"]);
      res.writeHead(200);
      res.end();
    } else {
      res.writeHead(200, {
        "content-type": "image/png",
        "x-amz-meta-sha256": metadata,
        "content-length": stored!.length,
      });
      res.end(stored);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const client = new S3Client({
    region: "auto",
    endpoint: `http://127.0.0.1:${address.port}`,
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: {
      accessKeyId: "local-fixture",
      secretAccessKey: "x".repeat(40),
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  try {
    const adapter = new R2BackfillStorage(client, "fixture-bucket");
    await adapter.createOnly("target.png", f.body);
    assert.deepEqual((await adapter.read("target.png")).bytes, f.body.bytes);
    await assert.rejects(adapter.createOnly("target.png", f.body));
    assert.deepEqual(stored, f.body.bytes);
  } finally {
    client.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
