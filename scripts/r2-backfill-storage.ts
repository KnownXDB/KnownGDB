import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { BackfillStorage, StoredBody } from "./execute-legacy-backfill.ts";
import { createHash } from "node:crypto";
import type { StorageInventory } from "./storage-reconciliation.ts";

// Existing originals are at most 16 MiB. This adapter is not a video uploader.
export class R2BackfillStorage implements BackfillStorage {
  constructor(
    private client: S3Client,
    private bucket: string,
  ) {}
  async inventory(): Promise<
    Pick<StorageInventory, "objects" | "observations">
  > {
    const objects: StorageInventory["objects"] = [];
    const observations: StorageInventory["observations"] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          ContinuationToken: cursor,
        }),
      );
      for (const item of page.Contents ?? []) {
        if (!item.Key || !Number.isSafeInteger(item.Size))
          throw Error("Incomplete storage listing.");
        const body = await this.read(item.Key);
        objects.push({
          key: item.Key,
          size: item.Size!,
          custom_metadata: body.metadata,
          http_metadata: { contentType: body.contentType },
        });
        observations.push({
          key: item.Key,
          size: body.bytes.byteLength,
          sha256: createHash("sha256").update(body.bytes).digest("hex"),
        });
      }
      cursor = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !cursor)
        throw Error("Missing storage pagination cursor.");
    } while (cursor);
    return { objects, observations };
  }
  async read(key: string): Promise<StoredBody> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!object.Body) throw Error("Object body is unavailable.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > 16 * 1024 * 1024)
          throw Error("Legacy object exceeds the reviewed import limit.");
        chunks.push(chunk);
      }
    } catch (error) {
      if ("destroy" in object.Body && typeof object.Body.destroy === "function")
        object.Body.destroy();
      throw error;
    }
    return {
      bytes: Buffer.concat(chunks),
      contentType: object.ContentType ?? "",
      metadata: object.Metadata ?? {},
    };
  }
  async createOnly(key: string, body: StoredBody): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body.bytes,
        ContentType: body.contentType,
        Metadata: body.metadata,
        IfNoneMatch: "*",
      }),
    );
  }
}
