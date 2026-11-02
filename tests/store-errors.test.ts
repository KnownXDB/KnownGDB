import test from "node:test";
import assert from "node:assert/strict";
import {
  OfficialStoreResponseError,
  storePreviewFailure,
} from "../apps/api/src/store-errors.ts";

test("store preview classifies unavailable identifiers", () => {
  const result = storePreviewFailure(
    new OfficialStoreResponseError("Xbox Store", 410),
    "Xbox / Microsoft Store",
    "unavailable",
  );
  assert.equal(result.status, 502);
  assert.deepEqual(result.body, {
    error:
      "Xbox / Microsoft Store could not find an active official page for this identifier (HTTP 410). Verify the identifier and its regional listing.",
    code: "identifier_not_found",
    providerStatus: 410,
  });
});

test("store preview distinguishes provider access denial", () => {
  const result = storePreviewFailure(
    new OfficialStoreResponseError("Epic Games Store", 403),
    "Epic Games Store",
    "unavailable",
  );
  assert.equal(result.status, 502);
  assert.deepEqual(result.body, {
    error:
      "Epic Games Store rejected the server-side request (HTTP 403). The identifier may still be valid; retry later or use an approved provider access method.",
    code: "provider_access_denied",
    providerStatus: 403,
  });
});

test("store preview returns bad input as an invalid identifier", () => {
  const result = storePreviewFailure(
    Error("Invalid Epic Games Store slug."),
    "Epic Games Store",
    "unavailable",
  );
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, {
    error: "Invalid Epic Games Store slug.",
    code: "invalid_identifier",
  });
});
