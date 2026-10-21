import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApiServer } from "../apps/api/src/node-adapter.ts";

test(
  "client disconnect aborts the Fetch request used for an in-flight storage read",
  { timeout: 5000 },
  async () => {
    let started!: () => void;
    let cancelled!: () => void;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const aborted = new Promise<void>((resolve) => {
      cancelled = resolve;
    });
    const server = createApiServer({}, async (request) => {
      started();
      await new Promise<void>((resolve) =>
        request.signal.addEventListener(
          "abort",
          () => {
            cancelled();
            resolve();
          },
          { once: true },
        ),
      );
      return new Response(null, { status: 499 });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    try {
      const cancellation = new AbortController();
      const response = fetch(
        `http://127.0.0.1:${address.port}/api/v1/asset-versions/fixture/preview`,
        { signal: cancellation.signal },
      ).catch(() => null);
      await reading;
      cancellation.abort();
      await aborted;
      await response;
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    }
  },
);

test("the Node adapter bounds incoming bytes and streams outgoing responses", async () => {
  let calls = 0;
  const server = createApiServer({}, async () => {
    calls++;
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "application/octet-stream" } },
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const rejected = await fetch(origin + "/api/v1/account/login", {
      method: "POST",
      body: " ".repeat(5000),
    });
    assert.equal(rejected.status, 413);
    assert.equal(calls, 0);
    const response = await fetch(
      origin + "/api/v1/asset-versions/fixture/preview",
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      new Uint8Array(await response.arrayBuffer()),
      new Uint8Array([1, 2, 3]),
    );
    assert.equal(calls, 1);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
});
