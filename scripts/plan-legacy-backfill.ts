import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { objectKey } from "../apps/api/src/asset-policy.ts";
import {
  reconcileStorage,
  type StorageInventory,
} from "./storage-reconciliation.ts";

type LegacyAsset = StorageInventory["assets"][number] & {
  role: "header" | "capsule" | "hero" | "logo" | "icon" | "client_icon";
  language_kind: "global" | "localized";
  language_tags: string[];
  provenance: string;
  rendition: string;
  created_at: string;
  valid_from: string | null;
  valid_until: string | null;
  source_reference: string;
  rights_reference: string;
  moderation_status: string;
  publication_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
};
export type BackfillInput = Omit<StorageInventory, "assets" | "uploads"> & {
  assets: LegacyAsset[];
  uploads: (StorageInventory["uploads"][number] & { actor_id: string })[];
  members: { user_id: string; active: boolean; role: string }[];
  existingCollectionIds: string[];
  existingVersionIds: string[];
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Plans copies and inserts only. There is deliberately no apply mode.
export function planLegacyBackfill(input: BackfillInput) {
  const reconciliation = reconcileStorage(input);
  if (reconciliation.summary.integrityErrors)
    throw Error("Resolve storage reconciliation errors before planning.");
  const assetIds = input.assets.map((asset) => asset.id);
  if (new Set(assetIds).size !== assetIds.length)
    throw Error("Duplicate legacy asset identities.");
  const entries = [...input.assets]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((asset) => {
      const upload = input.uploads.find(
        (row) => row.object_key === asset.object_key,
      );
      if (
        !upload?.completed_at ||
        upload.game_id !== asset.game_id ||
        upload.metadata.byte_size !== asset.byte_size ||
        upload.metadata.checksum_sha256 !== asset.checksum_sha256
      )
        throw Error(
          "A matching completed upload is required for uploader attribution.",
        );
      if (
        asset.provenance !== "official" ||
        asset.rendition !== "original" ||
        !input.members.some(
          (member) =>
            member.user_id === upload.actor_id &&
            member.active &&
            member.role === "super_admin",
        )
      )
        throw Error(
          "This backfill supports verified official originals from active Super Admin uploaders only.",
        );
      if (
        input.existingCollectionIds.includes(asset.id) ||
        input.existingVersionIds.includes(asset.id)
      )
        throw Error(
          "Target identity already exists; investigate before resuming.",
        );
      if (
        asset.moderation_status !== "approved" ||
        asset.publication_status !== "published" ||
        !asset.reviewed_by ||
        !asset.reviewed_at ||
        !asset.source_reference?.trim() ||
        !asset.rights_reference?.trim()
      )
        throw Error(
          "Complete original publication, source, rights and review evidence required.",
        );
      if (
        !Number.isFinite(Date.parse(asset.created_at)) ||
        !Number.isFinite(Date.parse(asset.reviewed_at)) ||
        Date.parse(asset.reviewed_at) < Date.parse(asset.created_at) ||
        Date.parse(upload.completed_at) > Date.parse(asset.created_at)
      )
        throw Error("Historical timestamps need explicit investigation.");
      if (
        asset.language_tags.some(
          (tag) => tag !== Intl.getCanonicalLocales(tag)[0].toLowerCase(),
        )
      )
        throw Error(
          "Review language normalization rather than silently changing legacy tags.",
        );
      const extension = asset.object_key.split(".").at(-1)!;
      const mimeTypes: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        ico: "image/vnd.microsoft.icon",
      };
      const mime = mimeTypes[extension];
      if (!mime || mime !== asset.mime_type)
        throw Error("Legacy MIME and extension disagree.");
      const targetKey = objectKey({
        gameId: asset.game_id,
        versionId: asset.id,
        provenance: "official",
        role: asset.role,
        languageKind: asset.language_kind,
        languages: asset.language_tags,
        createdAt: asset.created_at,
        extension,
      });
      if (input.objects.some((object) => object.key === targetKey))
        throw Error("Target object already exists; do not overwrite it.");
      return {
        legacyAssetId: asset.id,
        sourceSnapshot: structuredClone(asset),
        sourceSnapshotSha256: digest(asset),
        uploadSnapshot: structuredClone(upload),
        copy: {
          sourceKey: asset.object_key,
          targetKey,
          sha256: asset.checksum_sha256,
          byteSize: asset.byte_size,
          mimeType: asset.mime_type,
          preserveSource: true,
          requireAbsentDestination: true,
        },
        collection: {
          id: asset.id,
          game_id: asset.game_id,
          role: asset.role,
          provenance: "official",
          credit_kind: "official",
          uploader_id: upload.actor_id,
          public_author_id: null,
          created_at: asset.created_at,
        },
        version: {
          id: asset.id,
          collection_id: asset.id,
          game_id: asset.game_id,
          revision_number: 1,
          uploader_id: upload.actor_id,
          created_at: asset.created_at,
          language_kind: asset.language_kind,
          language_tags: [...asset.language_tags],
          context_key: "base",
          valid_from: asset.valid_from,
          valid_until: asset.valid_until,
          extension,
          object_key: targetKey,
          checksum_sha256: asset.checksum_sha256,
          byte_size: asset.byte_size,
          source_reference: asset.source_reference,
          rights_reference: asset.rights_reference,
          moderation_status: "approved",
          publication_status: "private",
          reviewed_by: asset.reviewed_by,
          reviewed_at: asset.reviewed_at,
          change_reason:
            "Import verified legacy original; preserve historical source evidence",
        },
        desiredPublicationStatus: asset.publication_status,
      };
    });
  return {
    formatVersion: 1,
    evidenceCheckedAt: input.checkedAt,
    entries,
    retainedIncompleteObjects: reconciliation.objects
      .filter((row) => row.classification === "expired-incomplete-upload")
      .map((row) => row.key),
    // Set storage_verified_at only after independently reading the new copy.
    applicationRequirements: [
      "Fresh source and membership checks",
      "Conditional create without overwrite",
      "Independent destination body verification",
      "Transactional source locks and drift checks",
      "Persist legacy/version mapping and complete source snapshot",
      "Record import audit at actual import time",
      "Separate explicit publication after verification",
    ],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (process.argv.length !== 4)
    throw Error(
      "Usage: npm run storage:plan-backfill -- <private-input.json> <ignored-output.json>",
    );
  const output = path.resolve(process.argv[3]);
  const localRoot = path.resolve(".local");
  if (
    !output.startsWith(localRoot + path.sep) ||
    path.dirname(output) !== localRoot ||
    fs.lstatSync(localRoot).isSymbolicLink()
  )
    throw Error("Write plans directly inside the ignored .local directory.");
  execFileSync("git", ["check-ignore", "--quiet", output]);
  if (
    execFileSync("git", ["ls-files", "--", output], { encoding: "utf8" }).trim()
  )
    throw Error("Refusing to write a tracked plan.");
  const plan = planLegacyBackfill(
    JSON.parse(fs.readFileSync(process.argv[2], "utf8")),
  );
  fs.writeFileSync(output, JSON.stringify(plan, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      plannedVersions: plan.entries.length,
      retainedIncompleteObjects: plan.retainedIncompleteObjects.length,
      remoteWrites: 0,
      publicationChanges: 0,
    }),
  );
}
