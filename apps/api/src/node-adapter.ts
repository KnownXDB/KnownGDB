import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { handleRequest, type ApiEnvironment } from "./handler.ts";

export function createApiServer(
  env: ApiEnvironment = process.env,
  handler: typeof handleRequest = handleRequest,
) {
  return createServer(async (incoming, outgoing) => {
    const cancellation = new AbortController();
    incoming.once("aborted", () => cancellation.abort());
    outgoing.once("close", () => {
      if (!outgoing.writableFinished) cancellation.abort();
    });
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers))
        if (value)
          headers.set(key, Array.isArray(value) ? value.join(",") : value);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > 4096) {
          outgoing.writeHead(413, { "Cache-Control": "no-store" });
          outgoing.end("Request is too large.");
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const host =
        incoming.headers.host ?? `127.0.0.1:${incoming.socket.localPort}`;
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
        outgoing.writeHead(400);
        outgoing.end("Invalid host.");
        return;
      }
      const request = new Request(`http://${host}${incoming.url ?? "/"}`, {
        method: incoming.method,
        headers,
        signal: cancellation.signal,
        ...(chunks.length &&
        incoming.method !== "GET" &&
        incoming.method !== "HEAD"
          ? { body: Buffer.concat(chunks) }
          : {}),
      });
      const response = await handler(request, env);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body)
        await pipeline(
          Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
          outgoing,
        );
      else outgoing.end();
    } catch {
      if (outgoing.destroyed) return;
      if (outgoing.headersSent) {
        outgoing.destroy();
        return;
      }
      outgoing.writeHead(500);
      outgoing.end("Service unavailable.");
    }
  });
}
