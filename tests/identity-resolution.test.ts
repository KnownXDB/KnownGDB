import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyCandidates,
  parseIdentities,
} from "../apps/api/src/identity-resolution.ts";

test("identity resolution treats conflicting or uncertain evidence conservatively", () => {
  const row = (game_id: string, evidence_status: string) => ({
    game_id,
    evidence_status,
  });
  assert.equal(classifyCandidates([], false).status, "not_found");
  assert.equal(classifyCandidates([row("a", "verified")], false).gameId, "a");
  assert.equal(
    classifyCandidates([row("a", "verified"), row("b", "verified")], false)
      .status,
    "conflict",
  );
  assert.equal(
    classifyCandidates([row("a", "observed")], false).status,
    "review",
  );
  assert.equal(
    classifyCandidates([row("a", "conflicted")], false).status,
    "conflict",
  );
  assert.equal(
    classifyCandidates([row("a", "verified")], true).status,
    "conflict",
  );
});
test("identity input is bounded and normalized", () => {
  const identity = {
    provider: "example",
    namespace: "games",
    kind: "id",
    value: "  ABC  ",
  };
  assert.equal(parseIdentities({ identities: [identity] })?.[0].value, "abc");
  assert.equal(parseIdentities({ identities: Array(21).fill(identity) }), null);
  assert.equal(
    parseIdentities({ identities: [{ ...identity, provider: "bad!" }] }),
    null,
  );
});
import { handleRequest } from "../apps/api/src/handler.ts";
test("identity endpoint refuses unconfigured and insecure access", async () => {
  const path = "/api/v1/admin/identities/resolve";
  const local = await handleRequest(
    new Request(`http://localhost${path}`, { method: "POST" }),
    {},
  );
  assert.equal(local.status, 503);
  const remote = await handleRequest(
    new Request(`http://example.invalid${path}`, { method: "POST" }),
    {},
  );
  assert.equal(remote.status, 403);
});
