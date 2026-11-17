import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { handleRequest } from "../apps/api/src/handler.ts";
import { createApiServer } from "../apps/api/src/node-adapter.ts";
import {
  partialDate,
  validateMetadata,
  metadataBodyLimit,
} from "../apps/api/src/game-metadata.ts";
import type { GameMetadata } from "@knowngdb/contracts";
const actor = "00000000-0000-4000-8000-000000000001",
  session = "00000000-0000-4000-8000-000000000002",
  game = "00000000-0000-4000-8000-000000000003",
  revision = "00000000-0000-4000-8000-000000000004",
  term = "00000000-0000-4000-8000-000000000005",
  release = "00000000-0000-4000-8000-000000000006";
const token = `fixture.${Buffer.from(JSON.stringify({ session_id: session })).toString("base64url")}.fixture`;
const data = (): GameMetadata => ({
  primaryLanguage: "en",
  originalTitle: "Original title",
  gameType: "game",
  localizations: [
    {
      language: "en",
      title: "Fixture game",
      summary: "Summary",
      description: "Description",
      aliases: ["Alias"],
    },
  ],
  credits: [
    { organizationId: term, role: "developer", releaseId: null, region: null },
  ],
  releases: [
    {
      id: release,
      platformId: term,
      edition: "Base",
      region: "WW",
      announcedDate: "2025-06",
      releaseDate: "2026",
      status: "released",
      availability: "available",
      storeUrl: "https://example.invalid/game",
    },
  ],
  languages: [
    {
      language: "en",
      releaseId: release,
      interface: true,
      subtitles: null,
      audio: false,
    },
  ],
  classifications: [term],
});
const payload = () => ({
  expectedRevisionId: null,
  data: data(),
  source: "Private evidence",
  confidence: 0.8,
  reason: "Initial metadata",
});
const endpoint = `http://localhost/api/v1/admin/games/${game}/metadata`;
const request = (body: unknown, url = endpoint) =>
  new Request(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: "http://localhost",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
async function fixture() {
  const state = {
    role: "super_admin",
    active: true,
    conflict: false,
    missing: false,
    calls: [] as { rpc: string; body: Record<string, unknown> }[],
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://localhost");
    const send = (value: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (url.pathname === "/auth/v1/user")
      return send({ id: actor, email_confirmed_at: "2026-01-01T00:00:00Z" });
    if (url.pathname.endsWith("/admin_members"))
      return send([{ role: state.role }]);
    if (url.pathname.endsWith("/admin_check")) return send(state.active);
    let raw = "";
    for await (const c of req) raw += c;
    const body = JSON.parse(raw || "{}");
    const rpc = url.pathname.split("/").at(-1)!;
    state.calls.push({ rpc, body });
    if (state.missing)
      return send(
        { code: "PGRST202", message: "Private schema diagnostics" },
        404,
      );
    if (state.conflict)
      return send({ code: "40001", message: "Private conflict details" }, 409);
    if (rpc === "published_game_metadata")
      return send({
        revisionId: revision,
        data: data(),
        terms: [{ id: term, kind: "organization", name: "Fixture studio" }],
      });
    if (rpc === "admin_game_metadata")
      return send({
        revision: null,
        approvedRevisionId: null,
        baseline: {
          title: "Fixture",
          language: "en",
          description: "",
          source: "Source",
        },
      });
    if (rpc === "admin_metadata_terms")
      return send(
        body.p_name ? { id: term, kind: body.p_kind, name: body.p_name } : [],
      );
    return send(revision);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    state,
    env: {
      SUPABASE_URL: `http://127.0.0.1:${address.port}`,
      SUPABASE_SECRET_KEY: "fixture-only",
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
test("metadata validates partial dates, tri-state languages, scopes, aliases and bounded normalized collections", () => {
  assert.deepEqual(validateMetadata(data()), data());
  for (const date of ["", "2026", "2026-02", "2024-02-29"])
    assert.equal(partialDate(date), date);
  for (const date of [
    "2026-02-29",
    "2026-02-30",
    "2026-13",
    "2026-2",
    "2026-01-01T00:00:00Z",
    "0000",
  ])
    assert.throws(() => partialDate(date));
  for (const mutate of [
    (d: GameMetadata) => d.localizations.push({ ...d.localizations[0] }),
    (d: GameMetadata) => {
      d.localizations[0].aliases = ["Alias", "alias"];
    },
    (d: GameMetadata) => {
      d.primaryLanguage = "es";
    },
    (d: GameMetadata) => {
      d.languages[0].releaseId = game;
    },
    (d: GameMetadata) => d.languages.push({ ...d.languages[0] }),
    (d: GameMetadata) => d.credits.push({ ...d.credits[0] }),
    (d: GameMetadata) => {
      d.releases[0].storeUrl = "https://user:secret@example.invalid";
    },
    (d: GameMetadata) => {
      d.releases[0].storeUrl = "javascript:alert(1)";
    },
    (d: GameMetadata) => {
      d.languages[0].language = "und";
    },
    (d: GameMetadata) => {
      d.classifications = [term, term];
    },
  ]) {
    const d = data();
    mutate(d);
    assert.throws(() => validateMetadata(d));
  }
  assert.throws(() => validateMetadata({ ...data(), status: "published" }));
});
test("metadata API derives actors, enforces active sessions and separates save, approval and public projection", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await handleRequest(new Request(endpoint), f.env)).status,
      401,
    );
    assert.equal((await handleRequest(request(payload()), f.env)).status, 201);
    assert.equal(f.state.calls.at(-1)!.rpc, "save_game_metadata");
    assert.equal(f.state.calls.at(-1)!.body.p_actor, actor);
    assert.equal(f.state.calls.at(-1)!.body.p_session, session);
    assert.equal(
      (await handleRequest(request({ ...payload(), actor: game }), f.env))
        .status,
      400,
    );
    assert.equal(
      (
        await handleRequest(
          new Request(endpoint, {
            method: "POST",
            headers: { Origin: "https://other.invalid" },
          }),
          f.env,
        )
      ).status,
      403,
    );
    f.state.role = "moderator";
    assert.equal(
      (
        await handleRequest(
          request(
            { expectedRevisionId: revision, reason: "Reviewed" },
            `${endpoint}/approval`,
          ),
          f.env,
        )
      ).status,
      403,
    );
    assert.equal((await handleRequest(request(payload()), f.env)).status, 201);
    f.state.role = "super_admin";
    assert.equal(
      (
        await handleRequest(
          request(
            { expectedRevisionId: revision, reason: "Reviewed" },
            `${endpoint}/approval`,
          ),
          f.env,
        )
      ).status,
      200,
    );
    assert.equal(f.state.calls.at(-1)!.rpc, "approve_game_metadata");
    f.state.conflict = true;
    const conflict = await handleRequest(request(payload()), f.env);
    assert.equal(conflict.status, 409);
    assert.ok(!(await conflict.text()).includes("Private conflict"));
    f.state.conflict = false;
    const publicResponse = await handleRequest(
      new Request(`http://localhost/api/v1/games/${game}/metadata`),
      f.env,
    );
    assert.equal(publicResponse.status, 200);
    assert.ok(!(await publicResponse.text()).includes("Private evidence"));
    assert.equal(f.state.calls.at(-1)!.rpc, "published_game_metadata");
    f.state.active = false;
    assert.equal((await handleRequest(request(payload()), f.env)).status, 401);
  } finally {
    await f.close();
  }
});
test("catalog term creation rejects duplicate authority fields and hides unavailable schema diagnostics", async () => {
  const f = await fixture();
  try {
    const url = "http://localhost/api/v1/admin/metadata-terms";
    assert.equal(
      (
        await handleRequest(
          request(
            { kind: "platform", name: "Fixture platform", source: "Evidence" },
            url,
          ),
          f.env,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await handleRequest(
          request(
            {
              kind: "platform",
              name: "Fixture",
              source: "Evidence",
              created_by: game,
            },
            url,
          ),
          f.env,
        )
      ).status,
      400,
    );
    f.state.missing = true;
    const response = await handleRequest(request(payload()), f.env);
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes("Private schema diagnostics"));
  } finally {
    await f.close();
  }
});
test("large descriptions pass bounded local and hosted adapters without weakening other body limits", async () => {
  const f = await fixture();
  const server = createApiServer(f.env);
  try {
    const body = payload();
    body.data.localizations[0].description = "A".repeat(20000);
    assert.equal((await handleRequest(request(body), f.env)).status, 201);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/admin/games/${game}/metadata`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    assert.equal(response.status, 201);
    assert.equal(
      (
        await handleRequest(
          request({ ...body, reason: "A".repeat(metadataBodyLimit) }),
          f.env,
        )
      ).status,
      413,
    );
    const other = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/admin/games`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "A".repeat(5000) }),
      },
    );
    assert.equal(other.status, 413);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await f.close();
  }
});
