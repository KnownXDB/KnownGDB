import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { handleRequest } from "../apps/api/src/handler.ts";
test("term resolver enforces integration authorization, quota and exact provider IDs", async () => {
  let authorization = "allowed";
  const queries: string[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname.endsWith("/consume_integration_credential"))
      return res.end(JSON.stringify(authorization));
    if (url.pathname.endsWith("/term_external_identities")) {
      queries.push(url.search);
      return res.end(
        JSON.stringify([{ term_id: "00000000-0000-4000-8000-000000000003" }]),
      );
    }
    res.statusCode = 404;
    res.end("{}");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const env = {
      SUPABASE_URL: `http://127.0.0.1:${address.port}`,
      SUPABASE_SECRET_KEY: "fixture-only",
    };
    const request = (auth = `Bearer kgsvc_${"a".repeat(43)}`) =>
      new Request(
        "http://localhost/api/v1/integrations/term-identities/resolve",
        {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [
              { kind: "organization", externalId: "123" },
              { kind: "platform", externalId: "123" },
            ],
          }),
        },
      );
    let response = await handleRequest(request(), env);
    assert.equal(response.status, 200);
    assert.deepEqual(
      (await response.json()).results.map(
        (item: { status: string }) => item.status,
      ),
      ["matched", "matched"],
    );
    assert.equal(
      new URLSearchParams(queries[0]).get("term_kind"),
      "eq.organization",
    );
    assert.equal(
      new URLSearchParams(queries[1]).get("term_kind"),
      "eq.platform",
    );
    authorization = "limited";
    response = await handleRequest(request(), env);
    assert.equal(response.status, 429);
    assert.equal(queries.length, 2);
    response = await handleRequest(request("Bearer kgdb_invalid"), env);
    assert.equal(response.status, 401);
    assert.equal(
      (
        await handleRequest(
          new Request("http://localhost/api/v1/admin/term-identities", {
            method: "POST",
          }),
          env,
        )
      ).status,
      401,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
