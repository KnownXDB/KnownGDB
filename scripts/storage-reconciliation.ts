import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Asset = {
  id: string;
  game_id: string;
  object_key: string;
  checksum_sha256: string;
  byte_size: number;
  mime_type: string;
};
type Upload = {
  object_key: string;
  completed_at: string | null;
  expires_at: string;
  game_id: string;
  metadata: { checksum_sha256?: string; byte_size?: number };
};
type StoredObject = {
  key: string;
  size: number;
  custom_metadata?: { sha256?: string };
  http_metadata?: { contentType?: string };
};
type Observation = { key: string; size: number; sha256: string };
export type StorageInventory = {
  checkedAt: string;
  assets: Asset[];
  uploads: Upload[];
  objects: StoredObject[];
  observations: Observation[];
};

// Pure comparison: no credentials, network access or storage/database writes.
export function reconcileStorage(input: StorageInventory) {
  const checkedAt = Date.parse(input.checkedAt);
  if (!Number.isFinite(checkedAt))
    throw Error("Valid inventory time required.");
  const errors: { key: string; reason: string }[] = [];
  const fail = (key: string, reason: string) => errors.push({ key, reason });
  for (const entries of [
    input.assets.map((row) => row.object_key),
    input.objects.map((row) => row.key),
    input.observations.map((row) => row.key),
    input.uploads.map((row) => row.object_key),
  ]) {
    const seen = new Set<string>();
    for (const key of entries) {
      if (seen.has(key)) fail(key, "Duplicate inventory key.");
      seen.add(key);
    }
  }
  for (const asset of input.assets) {
    if (!input.objects.some((object) => object.key === asset.object_key))
      fail(asset.object_key, "Database asset has no stored object.");
    const segments = asset.object_key.split("/");
    if (
      segments.length !== 3 ||
      segments[0] !== "originals" ||
      segments[1] !== asset.game_id ||
      segments[2].slice(0, segments[2].lastIndexOf(".")) !== asset.id
    )
      fail(asset.object_key, "Legacy key disagrees with canonical game/asset.");
  }
  const objects = input.objects.map((object) => {
    const asset = input.assets.find((row) => row.object_key === object.key);
    const upload = input.uploads.find((row) => row.object_key === object.key);
    const observed = input.observations.find((row) => row.key === object.key);
    if (
      !observed ||
      !/^[a-f0-9]{64}$/.test(observed.sha256) ||
      observed.size !== object.size ||
      observed.sha256 !== object.custom_metadata?.sha256
    )
      fail(
        object.key,
        "Body verification is missing or disagrees with storage.",
      );
    if (
      asset &&
      (asset.byte_size !== object.size ||
        asset.checksum_sha256 !== observed?.sha256 ||
        asset.mime_type !== object.http_metadata?.contentType)
    )
      fail(object.key, "Database metadata disagrees with verified storage.");
    const expiredIncompleteUpload =
      !asset &&
      upload &&
      !upload.completed_at &&
      Date.parse(upload.expires_at) <= checkedAt &&
      object.key.split("/")[1] === upload.game_id &&
      upload.metadata.byte_size === object.size &&
      upload.metadata.checksum_sha256 === observed?.sha256;
    const classification = asset
      ? "registered-legacy-asset"
      : expiredIncompleteUpload
        ? "expired-incomplete-upload"
        : "unresolved-object";
    if (classification === "unresolved-object")
      fail(
        object.key,
        "Object needs investigation; no automatic adoption/deletion.",
      );
    return { key: object.key, classification };
  });
  return {
    checkedAt: input.checkedAt,
    summary: {
      assets: input.assets.length,
      objects: input.objects.length,
      registered: objects.filter(
        (row) => row.classification === "registered-legacy-asset",
      ).length,
      expiredIncompleteUploads: objects.filter(
        (row) => row.classification === "expired-incomplete-upload",
      ).length,
      integrityErrors: errors.length,
    },
    objects,
    errors,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (process.argv.length !== 3)
    throw Error("Usage: npm run storage:reconcile -- <private-inventory.json>");
  const report = reconcileStorage(
    JSON.parse(fs.readFileSync(process.argv[2], "utf8")),
  );
  // Aggregate output is suitable for logs; object keys stay in private evidence.
  console.log(JSON.stringify(report.summary, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
