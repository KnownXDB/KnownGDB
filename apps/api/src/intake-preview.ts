import { parseIdentities, resolveIdentities } from "./identity-resolution.ts";
import { readJsonObject } from "./request-body.ts";
import type { ApiEnvironment } from "./handler.ts";
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function previewIntake(request: Request, env: ApiEnvironment) {
  if (request.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  if (new URL(request.url).search)
    return reply({ error: "Unexpected parameters." }, 400);
  const body = await readJsonObject(request);
  if (body instanceof Response) return body;
  if (
    Object.keys(body).join(",") !== "items" ||
    !Array.isArray(body.items) ||
    body.items.length < 1 ||
    body.items.length > 20
  )
    return reply({ error: "Provide 1 to 20 items." }, 400);
  const items: { clientId: string; identity: unknown }[] = [];
  for (const value of body.items) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "clientId,identity"
    )
      return reply({ error: "Invalid item." }, 400);
    const item = value as Record<string, unknown>;
    if (
      typeof item.clientId !== "string" ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(item.clientId)
    )
      return reply({ error: "Invalid item identifier." }, 400);
    items.push({ clientId: item.clientId, identity: item.identity });
  }
  const identities = parseIdentities({
    identities: items.map((item) => item.identity),
  });
  if (
    !identities ||
    new Set(items.map((item) => item.clientId)).size !== items.length ||
    new Set(identities.map((identity) => JSON.stringify(identity))).size !==
      items.length
  )
    return reply({ error: "Invalid or duplicate items." }, 400);
  const url = new URL(request.url);
  url.pathname = "/api/v1/integrations/identities/resolve";
  const response = await resolveIdentities(
    new Request(url, {
      method: "POST",
      headers: {
        Authorization: request.headers.get("authorization") ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identities }),
    }),
    env,
  );
  if (!response.ok) return response;
  const resolved = (await response.json()) as {
    results: { status: string; gameId: string | null }[];
  };
  return reply({
    items: resolved.results.map((result, index) => ({
      clientId: items[index].clientId,
      identityStatus: result.status,
      gameId: result.gameId,
      decision:
        result.status === "conflict"
          ? "conflict"
          : result.status === "matched"
            ? "review_existing"
            : result.status === "not_found"
              ? "review_new"
              : "review_identity",
    })),
  });
}
