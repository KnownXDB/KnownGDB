import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../apps/api/src/handler.ts";
import { readJsonObject } from "../apps/api/src/request-body.ts";

test("hosted account requests stop consuming an oversized streamed body", async () => {
  let pulled = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulled++;
        if (pulled > 200) controller.close();
        else controller.enqueue(new Uint8Array(1024).fill(32));
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    duplex: "half",
  };
  const response = await handleRequest(
    new Request("http://localhost/api/v1/account/login", init),
    { SUPABASE_URL: "https://example.invalid", SUPABASE_SECRET_KEY: "fixture" },
  );
  assert.equal(response.status, 413);
  assert.ok(pulled <= 5, `Consumed ${pulled} chunks before rejecting the body`);
  assert.equal(cancelled, true);
});

test("JSON framing validates media types, UTF-8 and object shape with byte limits", async () => {
  const make = (body: BodyInit, type = "application/json", length?: string) =>
    new Request("https://example.test", {
      method: "POST",
      body,
      headers: {
        "Content-Type": type,
        ...(length ? { "Content-Length": length } : {}),
      },
    });
  assert.deepEqual(
    await readJsonObject(
      make('{"name":"valid"}', "Application/JSON; charset=utf-8"),
    ),
    { name: "valid" },
  );
  for (const invalid of ["null", "[]", '"text"', "{"]) {
    const result = await readJsonObject(make(invalid));
    assert.ok(result instanceof Response);
    assert.equal(result.status, 400);
  }
  const malformed = await readJsonObject(make(new Uint8Array([0xff, 0xfe])));
  assert.ok(malformed instanceof Response);
  assert.equal(malformed.status, 400);
  const unsupported = await readJsonObject(make("{}", "application/jsonp"));
  assert.ok(unsupported instanceof Response);
  assert.equal(unsupported.status, 415);
  const oversized = await readJsonObject(
    make("{}", "application/json", "5000"),
  );
  assert.ok(oversized instanceof Response);
  assert.equal(oversized.status, 413);
});
