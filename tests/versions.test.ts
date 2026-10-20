import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { handleRequest } from "../apps/api/src/handler.ts";

const actor = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const game = "00000000-0000-4000-8000-000000000003";
const version = "00000000-0000-4000-8000-000000000010";
const token = `fixture.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString("base64url")}.fixture`;
const authorization = `Bearer ${token}`;
function row(id = version, publication = "published") {
  return {
    id,
    game_id: game,
    collection_id: "00000000-0000-4000-8000-000000000004",
    revision_number: 1,
    created_at: "2026-01-01T00:00:00.123456+00:00",
    language_kind: "localized",
    language_tags: ["en"],
    context_key: "base",
    valid_from: null,
    valid_until: null,
    moderation_status: "approved",
    publication_status: publication,
    storage_verified_at: "2026-01-01T00:00:00Z",
    rights_reference: "Private licensing evidence",
    change_reason: "Administrative reason",
    object_key: "private/storage/key.png",
    uploader_id: actor,
    asset_collections: {
      role: "logo",
      provenance: "official",
      credit_kind: "official",
      contributor_profiles: null,
      games: { status: "published" },
    },
  };
}
async function fixture() {
  const state = {
    role: "super_admin",
    activeSession: true,
    conflict: false,
    rows: [row(), row("00000000-0000-4000-8000-000000000009", "private")],
    requests: [] as URL[],
    writes: [] as Record<string, unknown>[],
  };
  const server = createServer(async (incoming, outgoing) => {
    const url = new URL(incoming.url!, "http://localhost");
    state.requests.push(url);
    const send = (value: unknown, status = 200) => {
      outgoing.writeHead(status, { "Content-Type": "application/json" });
      outgoing.end(JSON.stringify(value));
    };
    if (url.pathname === "/auth/v1/user")
      return send({ id: actor, email_confirmed_at: "2026-01-01T00:00:00Z" });
    if (url.pathname.endsWith("/admin_members"))
      return send([{ role: state.role }]);
    if (url.pathname.endsWith("/rpc/admin_check"))
      return send(state.activeSession);
    if (url.pathname.endsWith("/rpc/set_asset_version_publication")) {
      let text = "";
      for await (const chunk of incoming) text += chunk;
      const body = JSON.parse(text);
      state.writes.push(body);
      return state.conflict
        ? send({ code: "40001", message: "Private database details" }, 409)
        : send({ versionId: body.p_version, publicationStatus: body.p_status });
    }
    if (url.pathname.endsWith("/games")) return send([{ id: game }]);
    if (url.pathname.endsWith("/asset_versions")) {
      let rows = state.rows;
      if (url.searchParams.get("publication_status") === "eq.published") {
        assert.equal(url.searchParams.get("moderation_status"), "eq.approved");
        assert.equal(
          url.searchParams.get("storage_verified_at"),
          "not.is.null",
        );
        assert.equal(
          url.searchParams.get("asset_collections.games.status"),
          "eq.published",
        );
        rows = rows.filter(
          (r) =>
            r.publication_status === "published" &&
            r.moderation_status === "approved" &&
            r.storage_verified_at &&
            r.asset_collections.games.status === "published",
        );
      }
      return send(rows.slice(0, Number(url.searchParams.get("limit"))));
    }
    send({ error: "Unexpected fixture request" }, 500);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    state,
    env: {
      SUPABASE_URL: `http://127.0.0.1:${address.port}`,
      SUPABASE_SECRET_KEY: "local-fixture",
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
const publicUrl = `http://localhost/api/v1/games/${game}/asset-versions`;
const adminUrl = "http://localhost/api/v1/admin/asset-versions";
const writeUrl = `${adminUrl}/${version}/publication`;
const write = (body: unknown, origin = "http://localhost") =>
  new Request(writeUrl, {
    method: "POST",
    headers: { authorization, origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const validBody = {
  expectedStatus: "private",
  publicationStatus: "published",
  reason: "Reviewed for publication",
};

test("public version reads filter publication and project only safe credit/history metadata", async () => {
  const f = await fixture();
  try {
    const rejected = row("00000000-0000-4000-8000-000000000008");
    rejected.moderation_status = "rejected";
    f.state.rows.push(rejected);
    const response = await handleRequest(new Request(publicUrl), f.env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.versions.length, 1);
    assert.equal(body.versions[0].credit.label, "Official asset");
    assert.equal(body.versions[0].canPublish, false);
    assert.equal(body.versions[0].changeReason, undefined);
    const text = JSON.stringify(body);
    for (const privateValue of [
      "private/storage",
      "Private licensing",
      actor,
      "uploader_id",
      "object_key",
    ])
      assert.ok(!text.includes(privateValue));
  } finally {
    await f.close();
  }
});

test("history uses bounded keyset pagination preserving microsecond timestamps", async () => {
  const f = await fixture();
  try {
    f.state.rows[1].publication_status = "published";
    const first = await handleRequest(
      new Request(`${publicUrl}?limit=1`),
      f.env,
    );
    const data = await first.json();
    assert.equal(data.versions.length, 1);
    assert.ok(data.nextCursor);
    await handleRequest(
      new Request(`${publicUrl}?limit=1&cursor=${data.nextCursor}`),
      f.env,
    );
    assert.ok(
      f.state.requests.some((url) =>
        url.searchParams.get("or")?.includes("00:00:00.123456+00:00"),
      ),
    );
    for (const query of [
      "limit=999",
      "limit=0",
      "cursor=bad",
      "select=object_key",
      "limit=1&limit=2",
    ])
      assert.equal(
        (await handleRequest(new Request(`${publicUrl}?${query}`), f.env))
          .status,
        400,
      );
  } finally {
    await f.close();
  }
});

test("administrative history requires verified membership and an active session; moderators cannot publish", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await handleRequest(new Request(adminUrl), f.env)).status,
      401,
    );
    f.state.role = "moderator";
    const history = await handleRequest(
      new Request(adminUrl, { headers: { authorization } }),
      f.env,
    );
    assert.equal(history.status, 200);
    const body = await history.json();
    assert.equal(body.versions.length, 2);
    assert.ok(
      body.versions.every((v: { canPublish: boolean }) => !v.canPublish),
    );
    assert.equal((await handleRequest(write(validBody), f.env)).status, 403);
    f.state.activeSession = false;
    assert.equal(
      (
        await handleRequest(
          new Request(adminUrl, { headers: { authorization } }),
          f.env,
        )
      ).status,
      401,
    );
    assert.equal(f.state.writes.length, 0);
  } finally {
    await f.close();
  }
});

test("publication rejects CSRF and mass assignment, derives identity and maps stale-state conflicts", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await handleRequest(write(validBody, "https://example.invalid"), f.env))
        .status,
      403,
    );
    for (const body of [
      { ...validBody, actor: "forged" },
      { ...validBody, reason: " " },
      { ...validBody, publicationStatus: "approved" },
    ])
      assert.equal((await handleRequest(write(body), f.env)).status, 400);
    assert.equal(f.state.writes.length, 0);
    assert.equal((await handleRequest(write(validBody), f.env)).status, 200);
    assert.equal(f.state.writes[0].p_actor, actor);
    assert.equal(f.state.writes[0].p_session, sessionId);
    assert.equal(f.state.writes[0].p_expected, "private");
    f.state.conflict = true;
    const conflict = await handleRequest(write(validBody), f.env);
    assert.equal(conflict.status, 409);
    assert.ok(!(await conflict.text()).includes("Private database details"));
  } finally {
    await f.close();
  }
});
