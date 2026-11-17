import { test } from "node:test";
import assert from "node:assert/strict";
import type { VersionSummary } from "@knowngdb/contracts";
import { runReviewWorkflow } from "../apps/admin/src/review-workflow.ts";

const version = { id: "test-id", moderation: "submitted" } as VersionSummary;
test("one approval and publication action preserves audited transitions", async () => {
  const calls: { path: string; body: object }[] = [];
  let approved = false;
  await runReviewWorkflow(
    version,
    "approve-publish",
    "Reviewed",
    async (path, body) => {
      calls.push({ path, body });
    },
    () => {
      approved = true;
    },
  );
  assert.deepEqual(
    calls.map((c) => c.body),
    [
      { expectedStatus: "submitted", status: "in_review", reason: "Reviewed" },
      { expectedStatus: "in_review", status: "approved", reason: "Reviewed" },
      {
        expectedStatus: "private",
        publicationStatus: "published",
        reason: "Reviewed",
      },
    ],
  );
  assert.equal(approved, true);
});
test("publication failure leaves approval detectable and stops", async () => {
  let count = 0,
    approved = false;
  await assert.rejects(
    runReviewWorkflow(
      version,
      "approve-publish",
      "Reviewed",
      async () => {
        if (++count === 3) throw Error("offline");
      },
      () => {
        approved = true;
      },
    ),
    /offline/,
  );
  assert.equal(approved, true);
  assert.equal(count, 3);
});
test("rejection does not attempt publication", async () => {
  const calls: object[] = [];
  await runReviewWorkflow(
    version,
    "reject",
    "Invalid",
    async (_path, body) => {
      calls.push(body);
    },
    () => {
      throw Error("unexpected approval");
    },
  );
  assert.deepEqual(calls, [
    { expectedStatus: "submitted", status: "in_review", reason: "Invalid" },
    { expectedStatus: "in_review", status: "rejected", reason: "Invalid" },
  ]);
});
