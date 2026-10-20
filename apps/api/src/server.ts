import { createServer } from "node:http";
import { handleRequest } from "./handler.ts";

const port = Number(process.env.API_PORT ?? 8787);
const server = createServer(async (incoming, outgoing) => {
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
    const host = incoming.headers.host ?? `127.0.0.1:${port}`;
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
      outgoing.writeHead(400);
      outgoing.end("Invalid host.");
      return;
    }
    const request = new Request(`http://${host}${incoming.url ?? "/"}`, {
      method: incoming.method,
      headers,
      ...(chunks.length &&
      incoming.method !== "GET" &&
      incoming.method !== "HEAD"
        ? { body: Buffer.concat(chunks) }
        : {}),
    });
    const response = await handleRequest(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500);
    outgoing.end("Service unavailable.");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`KnownGDB API: http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
