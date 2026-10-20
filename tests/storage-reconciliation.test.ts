import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileStorage,
  type StorageInventory,
} from "../scripts/storage-reconciliation.ts";

const checksum = "a".repeat(64);
const key = "originals/local-game/local-asset.png";
const fixture = (): StorageInventory => ({
  checkedAt: "2026-10-20T00:00:00Z",
  assets: [
    {
      id: "local-asset",
      game_id: "local-game",
      object_key: key,
      checksum_sha256: checksum,
      byte_size: 100,
      mime_type: "image/png",
    },
  ],
  uploads: [],
  objects: [
    {
      key,
      size: 100,
      custom_metadata: { sha256: checksum },
      http_metadata: { contentType: "image/png" },
    },
  ],
  observations: [{ key, size: 100, sha256: checksum }],
});

test("reconciliation requires body hashes and exact canonical legacy ownership", () => {
  assert.equal(reconcileStorage(fixture()).summary.integrityErrors, 0);
  for (const change of [
    (i: StorageInventory) => {
      i.observations = [];
    },
    (i: StorageInventory) => {
      i.observations[0].sha256 = "b".repeat(64);
    },
    (i: StorageInventory) => {
      i.objects[0].size++;
    },
    (i: StorageInventory) => {
      i.objects[0].http_metadata!.contentType = "image/jpeg";
    },
    (i: StorageInventory) => {
      i.assets[0].game_id = "another-game";
    },
    (i: StorageInventory) => {
      i.assets[0].id = "another-asset";
    },
    (i: StorageInventory) => {
      i.objects = [];
    },
    (i: StorageInventory) => {
      i.objects.push(i.objects[0]);
    },
  ]) {
    const input = fixture();
    change(input);
    assert.ok(reconcileStorage(input).summary.integrityErrors > 0);
  }
});

test("expired incomplete uploads stay distinct from registered assets and unknown objects", () => {
  const input = fixture();
  input.assets = [];
  input.uploads = [
    {
      object_key: key,
      game_id: "local-game",
      completed_at: null,
      expires_at: "2026-10-19T00:00:00Z",
      metadata: { checksum_sha256: checksum, byte_size: 100 },
    },
  ];
  const before = structuredClone(input);
  const report = reconcileStorage(input);
  assert.equal(report.summary.expiredIncompleteUploads, 1);
  assert.equal(report.summary.registered, 0);
  assert.equal(report.summary.integrityErrors, 0);
  assert.deepEqual(input, before);
  input.uploads[0].metadata.checksum_sha256 = "b".repeat(64);
  assert.ok(reconcileStorage(input).summary.integrityErrors > 0);
  input.uploads = [];
  assert.equal(
    reconcileStorage(input).objects[0].classification,
    "unresolved-object",
  );
});
