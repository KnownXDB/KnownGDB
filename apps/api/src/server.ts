import { createApiServer } from "./node-adapter.ts";
const port = Number(process.env.API_PORT ?? 8787);
const server = createApiServer();
server.listen(port, "127.0.0.1", () =>
  console.log(`KnownGDB API: http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
