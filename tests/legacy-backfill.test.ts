import assert from "node:assert/strict";
import test from "node:test";
import {
  planLegacyBackfill,
  type BackfillInput,
} from "../scripts/plan-legacy-backfill.ts";

function fixture(): BackfillInput {
  const id = "00000000-0000-4000-8000-000000000001";
  const game = "00000000-0000-4000-8000-000000000002";
  const key = `originals/${game}/${id}.png`;
  const hash = "a".repeat(64);
  return {
    checkedAt: "2026-10-20T00:00:00Z",
    assets: [
      {
        id,
        game_id: game,
        object_key: key,
        role: "logo",
        language_kind: "localized",
        language_tags: ["en"],
        checksum_sha256: hash,
        byte_size: 100,
        mime_type: "image/png",
        provenance: "official",
        rendition: "original",
        created_at: "2026-09-30T23:00:00-03:00",
        valid_from: null,
        valid_until: null,
        source_reference: "https://example.invalid/source",
        rights_reference: "Synthetic rights fixture",
        moderation_status: "approved",
        publication_status: "published",
        reviewed_by: id,
        reviewed_at: "2026-10-01T04:00:00Z",
      },
    ],
    uploads: [
      {
        object_key: key,
        game_id: game,
        actor_id: id,
        completed_at: "2026-10-01T02:00:00Z",
        expires_at: "2026-10-02T00:00:00Z",
        metadata: { checksum_sha256: hash, byte_size: 100 },
      },
    ],
    objects: [
      {
        key,
        size: 100,
        custom_metadata: { sha256: hash },
        http_metadata: { contentType: "image/png" },
      },
    ],
    observations: [{ key, size: 100, sha256: hash }],
    members: [{ user_id: id, active: true, role: "super_admin" }],
    existingCollectionIds: [],
    existingVersionIds: [],
  };
}

test("backfill plans deterministic copies with original dates, uploader, review and private state", () => {
  const input = fixture();
  const before = structuredClone(input);
  const plan = planLegacyBackfill(input);
  assert.deepEqual(plan, planLegacyBackfill(input));
  assert.deepEqual(input, before);
  const entry = plan.entries[0];
  assert.equal(entry.legacyAssetId, entry.collection.id);
  assert.equal(entry.legacyAssetId, entry.version.id);
  assert.equal(entry.collection.uploader_id, input.uploads[0].actor_id);
  assert.equal(entry.collection.public_author_id, null);
  assert.equal(entry.version.created_at, input.assets[0].created_at);
  assert.equal(entry.version.reviewed_at, input.assets[0].reviewed_at);
  assert.equal(
    entry.version.rights_reference,
    input.assets[0].rights_reference,
  );
  assert.equal(entry.version.publication_status, "private");
  assert.equal(entry.desiredPublicationStatus, "published");
  assert.ok(!("storage_verified_at" in entry.version));
  assert.match(entry.copy.targetKey, /\/en\/2026\/10\//);
  assert.notEqual(entry.copy.sourceKey, entry.copy.targetKey);
  assert.equal(entry.copy.requireAbsentDestination, true);
  assert.equal(entry.copy.preserveSource, true);
  assert.deepEqual(entry.sourceSnapshot, input.assets[0]);
});

test("backfill fails closed on attribution, rights, timestamps, inventory drift and target conflicts", () => {
  for (const change of [
    (i: BackfillInput) => {
      i.uploads[0].completed_at = null;
    },
    (i: BackfillInput) => {
      i.uploads[0].actor_id = "unknown-uploader";
    },
    (i: BackfillInput) => {
      i.members[0].active = false;
    },
    (i: BackfillInput) => {
      i.assets[0].rights_reference = "";
    },
    (i: BackfillInput) => {
      i.assets[0].reviewed_at = "2020-01-01T00:00:00Z";
    },
    (i: BackfillInput) => {
      i.assets[0].rendition = "derivative";
    },
    (i: BackfillInput) => {
      i.assets[0].language_tags = ["EN"];
    },
    (i: BackfillInput) => {
      i.observations[0].sha256 = "b".repeat(64);
    },
    (i: BackfillInput) => {
      i.existingVersionIds.push(i.assets[0].id);
    },
    (i: BackfillInput) => {
      i.existingCollectionIds.push(i.assets[0].id);
    },
    (i: BackfillInput) => {
      i.assets.push(i.assets[0]);
    },
  ]) {
    const input = fixture();
    change(input);
    assert.throws(() => planLegacyBackfill(input));
  }
});
