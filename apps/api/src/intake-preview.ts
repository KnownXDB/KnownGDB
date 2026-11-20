import { createClient } from "@supabase/supabase-js";
import { gameTypes } from "@knowngdb/contracts";
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
  const items: {
    clientId: string;
    identity: unknown;
    proposal: Record<string, string> | null;
  }[] = [];
  for (const value of body.items) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !["clientId,identity", "clientId,identity,proposal"].includes(
        Object.keys(value).sort().join(","),
      )
    )
      return reply({ error: "Invalid item." }, 400);
    const item = value as Record<string, unknown>;
    if (
      typeof item.clientId !== "string" ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(item.clientId)
    )
      return reply({ error: "Invalid item identifier." }, 400);
    let proposal: Record<string, string> | null = null;
    if (item.proposal !== undefined) {
      const value = item.proposal;
      if (!value || typeof value !== "object" || Array.isArray(value))
        return reply({ error: "Invalid proposal." }, 400);
      const candidate = value as Record<string, unknown>;
      if (
        !Object.keys(candidate).length ||
        Object.keys(candidate).some(
          (key) => !["originalTitle", "gameType"].includes(key),
        ) ||
        ("originalTitle" in candidate &&
          (typeof candidate.originalTitle !== "string" ||
            candidate.originalTitle.length > 300 ||
            /[\p{Cc}\p{Cf}]/u.test(candidate.originalTitle))) ||
        ("gameType" in candidate &&
          (typeof candidate.gameType !== "string" ||
            !gameTypes.includes(
              candidate.gameType as (typeof gameTypes)[number],
            )))
      )
        return reply({ error: "Invalid proposal." }, 400);
      proposal = candidate as Record<string, string>;
    }
    items.push({ clientId: item.clientId, identity: item.identity, proposal });
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
  const client = createClient(env.SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { retry: false },
  });
  const previews = [];
  for (const [index, result] of resolved.results.entries()) {
    const proposal = items[index].proposal;
    let comparison: unknown = null;
    if (proposal && result.status === "matched" && result.gameId) {
      const published = await client.rpc("published_game_metadata", {
        p_game: result.gameId,
      });
      if (published.error)
        return reply({ error: "Published metadata unavailable." }, 503);
      if (published.data?.data) {
        const existing = published.data.data as Record<string, unknown>;
        if (
          Object.keys(proposal).some((key) => typeof existing[key] !== "string")
        )
          return reply({ error: "Published metadata unavailable." }, 503);
        comparison = {
          status: "available",
          revisionId: published.data.revisionId,
          fields: Object.entries(proposal).map(([field, proposed]) => ({
            field,
            current: existing[field],
            proposed,
            changed: existing[field] !== proposed,
          })),
        };
      } else
        comparison = { status: "unavailable", revisionId: null, fields: [] };
    }
    previews.push({
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
      ...(proposal
        ? {
            comparison: comparison ?? {
              status: "unavailable",
              revisionId: null,
              fields: [],
            },
          }
        : {}),
    });
  }
  return reply({ items: previews });
}
