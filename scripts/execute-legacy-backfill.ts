import { createHash } from "node:crypto";
import {
  planLegacyBackfill,
  type BackfillInput,
} from "./plan-legacy-backfill.ts";

export type BackfillPlan = ReturnType<typeof planLegacyBackfill>;
export type StoredBody = {
  bytes: Uint8Array;
  contentType: string;
  metadata: Record<string, string>;
};
export type CopyReceipt = BackfillPlan["entries"][number] & {
  verifiedAt: string;
};
export interface BackfillStorage {
  read(key: string): Promise<StoredBody>;
  createOnly(key: string, body: StoredBody): Promise<void>;
}
export type ImportProgress = (event: {
  stage:
    "copy-started" | "copy-created" | "copy-verified" | "database-committed";
  legacyAssetId?: string;
}) => void;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function verify(
  body: StoredBody,
  copy: BackfillPlan["entries"][number]["copy"],
) {
  if (
    body.bytes.byteLength !== copy.byteSize ||
    body.contentType !== copy.mimeType ||
    body.metadata.sha256 !== copy.sha256 ||
    createHash("sha256").update(body.bytes).digest("hex") !== copy.sha256
  )
    throw Error(
      "Stored body or metadata disagrees with the approved copy plan.",
    );
}

// The caller must explicitly authorize the environment before invoking this core.
// No delete, overwrite, implicit retry or publication operation is available.
export async function executeLegacyBackfill(
  approved: BackfillPlan,
  current: BackfillInput,
  storage: BackfillStorage,
  register: (
    receipts: CopyReceipt[],
  ) => Promise<{ imported: number; publicationStatus: string }>,
  progress: ImportProgress = () => {},
) {
  const fresh = planLegacyBackfill(current);
  if (
    !fresh.entries.length ||
    approved.formatVersion !== fresh.formatVersion ||
    canonical(approved.entries) !== canonical(fresh.entries) ||
    canonical(approved.retainedIncompleteObjects) !==
      canonical(fresh.retainedIncompleteObjects)
  )
    throw Error(
      "Approved plan differs from fresh evidence; review a new plan.",
    );
  const receipts: CopyReceipt[] = [];
  for (const entry of fresh.entries) {
    const source = await storage.read(entry.copy.sourceKey);
    verify(source, entry.copy);
    progress({ stage: "copy-started", legacyAssetId: entry.legacyAssetId });
    await storage.createOnly(entry.copy.targetKey, source);
    progress({ stage: "copy-created", legacyAssetId: entry.legacyAssetId });
    const destination = await storage.read(entry.copy.targetKey);
    verify(destination, entry.copy);
    receipts.push({ ...entry, verifiedAt: new Date().toISOString() });
    progress({ stage: "copy-verified", legacyAssetId: entry.legacyAssetId });
  }
  const result = await register(receipts);
  if (
    result.imported !== receipts.length ||
    result.publicationStatus !== "private"
  )
    throw Error("Database outcome is uncertain; investigate without retrying.");
  progress({ stage: "database-committed" });
  return { imported: result.imported, publicationStatus: "private" as const };
}
