import test from "node:test";
import assert from "node:assert/strict";
import {
  objectKey,
  languageScope,
  creditOptions,
  selectVersion,
} from "../apps/api/src/asset-policy.ts";
import type { AssetVersion } from "@knowngdb/contracts";
const game = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const input = {
  gameId: game,
  versionId: id,
  provenance: "official" as const,
  role: "hero" as const,
  languageKind: "localized" as const,
  languages: ["en-US"],
  createdAt: "2026-12-31T23:00:00-03:00",
  extension: "png",
};
test("object keys bind canonical game, origin, language, UTC chronology and unique version", () => {
  assert.equal(
    objectKey(input),
    `games/${game}/official/hero/en-us/2027/01/${id}/original.png`,
  );
  assert.throws(() => objectKey({ ...input, gameId: "../other-game" }));
  assert.throws(() => objectKey({ ...input, extension: "../exe" }));
  assert.throws(() => objectKey({ ...input, extension: "ico" }));
  assert.throws(() => objectKey({ ...input, extension: "mp4" }));
  assert.throws(() => objectKey({ ...input, role: "trailer" }));
  assert.ok(
    objectKey({ ...input, role: "client_icon", extension: "ico" }).endsWith(
      "original.ico",
    ),
  );
  assert.ok(
    objectKey({ ...input, role: "trailer", extension: "webm" }).endsWith(
      "original.webm",
    ),
  );
});
test("language scope distinguishes Global, localized and multilingual content", () => {
  assert.equal(languageScope("global", []), "global");
  assert.equal(languageScope("localized", ["en", "es"]), "multi");
  assert.throws(() => languageScope("global", ["en"]));
  assert.throws(() => languageScope("localized", ["EN", "en"]));
  assert.throws(() => languageScope("localized", ["und"]));
});
test("only registered Super Admins can select platform and official publication identities", () => {
  assert.deepEqual(creditOptions("super_admin", false), []);
  assert.deepEqual(creditOptions(null, true), ["personal"]);
  assert.deepEqual(creditOptions("super_admin", true), [
    "official",
    "platform",
    "personal",
  ]);
});
const base: AssetVersion = {
  id,
  gameId: game,
  role: "hero",
  languageKind: "global",
  languages: [],
  context: "base",
  createdAt: "2026-01-01T00:00:00Z",
  validFrom: null,
  validUntil: null,
  moderation: "approved",
  published: true,
  rightsVerified: true,
};
test("seasonal selection expires to base without deleting history or crossing games/languages", () => {
  const seasonal = {
    ...base,
    id: "season",
    context: "holiday",
    languageKind: "localized" as const,
    languages: ["en"],
    validFrom: "2026-12-01T00:00:00Z",
    validUntil: "2027-01-01T00:00:00Z",
  };
  const versions = [
    base,
    seasonal,
    { ...seasonal, id: "unreviewed", moderation: "submitted" as const },
    { ...seasonal, id: "foreign", gameId: "other" },
  ];
  const request = {
    gameId: game,
    role: "hero" as const,
    context: "holiday",
    language: "en",
    asOf: "2026-12-25T00:00:00Z",
  };
  assert.equal(selectVersion(versions, request)?.id, "season");
  assert.equal(selectVersion(versions, { ...request, language: "es" })?.id, id);
  assert.equal(
    selectVersion(versions, { ...request, asOf: "2027-01-01T00:00:00Z" })?.id,
    id,
  );
  assert.equal(versions.length, 4);
  assert.equal(selectVersion([{ ...base, published: false }], request), null);
  assert.equal(
    selectVersion([{ ...base, rightsVerified: false }], request),
    null,
  );
});
