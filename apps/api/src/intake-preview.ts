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
export const intakePreviewBodyLimit = 128 * 1024;
type LocalizedProposal = {
  language: string;
  title?: string;
  summary?: string;
  description?: string;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type CreditProposal = {
  organizationId: string;
  role: string;
  releaseId: string | null;
  region: string | null;
};
type Proposal = {
  originalTitle?: string;
  gameType?: string;
  localizations?: LocalizedProposal[];
  credits?: CreditProposal[];
  platformIds?: string[];
};
export async function previewIntake(request: Request, env: ApiEnvironment) {
  if (request.method !== "POST")
    return reply({ error: "Method not allowed." }, 405);
  if (new URL(request.url).search)
    return reply({ error: "Unexpected parameters." }, 400);
  const body = await readJsonObject(request, intakePreviewBodyLimit);
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
    proposal: Proposal | null;
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
    let proposal: Proposal | null = null;
    if (item.proposal !== undefined) {
      const value = item.proposal;
      if (!value || typeof value !== "object" || Array.isArray(value))
        return reply({ error: "Invalid proposal." }, 400);
      const candidate = value as Record<string, unknown>;
      if (
        !Object.keys(candidate).length ||
        Object.keys(candidate).some(
          (key) =>
            ![
              "originalTitle",
              "gameType",
              "localizations",
              "credits",
              "platformIds",
            ].includes(key),
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
      if ("localizations" in candidate) {
        if (
          !Array.isArray(candidate.localizations) ||
          candidate.localizations.length < 1 ||
          candidate.localizations.length > 8
        )
          return reply({ error: "Invalid localizations." }, 400);
        const languages = new Set<string>();
        for (const entry of candidate.localizations) {
          if (!entry || typeof entry !== "object" || Array.isArray(entry))
            return reply({ error: "Invalid localization." }, 400);
          const row = entry as Record<string, unknown>;
          const keys = Object.keys(row);
          if (
            keys.some(
              (key) =>
                !["language", "title", "summary", "description"].includes(key),
            ) ||
            keys.length < 2 ||
            typeof row.language !== "string" ||
            row.language === "und" ||
            !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(row.language)
          )
            return reply({ error: "Invalid localization." }, 400);
          try {
            if (
              Intl.getCanonicalLocales(row.language)[0]?.toLowerCase() !==
              row.language
            )
              throw Error();
          } catch {
            return reply({ error: "Invalid localization language." }, 400);
          }
          if (languages.has(row.language))
            return reply({ error: "Duplicate localization." }, 400);
          languages.add(row.language);
          for (const [field, max] of [
            ["title", 300],
            ["summary", 500],
            ["description", 20000],
          ] as const)
            if (
              field in row &&
              (typeof row[field] !== "string" ||
                row[field].length > max ||
                /[\p{Cf}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(
                  row[field],
                ) ||
                (field === "title" && !row[field].trim()))
            )
              return reply({ error: "Invalid localized text." }, 400);
        }
      }
      if ("credits" in candidate) {
        if (
          !Array.isArray(candidate.credits) ||
          candidate.credits.length < 1 ||
          candidate.credits.length > 50
        )
          return reply({ error: "Invalid credits." }, 400);
        const seen = new Set<string>();
        for (const entry of candidate.credits) {
          if (!entry || typeof entry !== "object" || Array.isArray(entry))
            return reply({ error: "Invalid credit." }, 400);
          const c = entry as Record<string, unknown>;
          if (
            Object.keys(c).sort().join(",") !==
              "organizationId,region,releaseId,role" ||
            typeof c.organizationId !== "string" ||
            !uuid.test(c.organizationId) ||
            typeof c.role !== "string" ||
            ![
              "developer",
              "publisher",
              "support",
              "porting",
              "distributor",
            ].includes(c.role) ||
            (c.releaseId !== null &&
              (typeof c.releaseId !== "string" || !uuid.test(c.releaseId))) ||
            (c.region !== null &&
              (typeof c.region !== "string" || !/^[A-Z]{2}$/.test(c.region)))
          )
            return reply({ error: "Invalid credit." }, 400);
          const key = JSON.stringify([
            c.organizationId.toLowerCase(),
            c.role,
            typeof c.releaseId === "string" ? c.releaseId.toLowerCase() : null,
            c.region,
          ]);
          if (seen.has(key)) return reply({ error: "Duplicate credit." }, 400);
          seen.add(key);
        }
      }
      if ("platformIds" in candidate) {
        if (
          !Array.isArray(candidate.platformIds) ||
          candidate.platformIds.length < 1 ||
          candidate.platformIds.length > 50 ||
          candidate.platformIds.some(
            (id) => typeof id !== "string" || !uuid.test(id),
          ) ||
          new Set(candidate.platformIds.map((id) => id.toLowerCase())).size !==
            candidate.platformIds.length
        )
          return reply({ error: "Invalid platforms." }, 400);
      }
      proposal = candidate as Proposal;
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
          Object.keys(proposal)
            .filter(
              (key) =>
                !["localizations", "credits", "platformIds"].includes(key),
            )
            .some((key) => typeof existing[key] !== "string")
        )
          return reply({ error: "Published metadata unavailable." }, 503);
        comparison = {
          status: "available",
          revisionId: published.data.revisionId,
          fields: Object.entries(proposal)
            .filter(
              ([field]) =>
                !["localizations", "credits", "platformIds"].includes(field),
            )
            .map(([field, proposed]) => ({
              field,
              current: existing[field],
              proposed,
              changed: existing[field] !== proposed,
            })),
        };
        if (proposal.localizations) {
          if (!Array.isArray(existing.localizations))
            return reply({ error: "Published metadata unavailable." }, 503);
          const rows = existing.localizations as Record<string, unknown>[];
          const localizedFields = proposal.localizations.flatMap((row) => {
            const found = rows.find((value) => value.language === row.language);
            return (["title", "summary", "description"] as const)
              .filter((field) => row[field] !== undefined)
              .map((field) => ({
                language: row.language,
                field,
                current: found?.[field] ?? null,
                proposed: row[field]!.trim(),
                changed: found?.[field] !== row[field]!.trim(),
              }));
          });
          (comparison as { localizedFields?: unknown }).localizedFields =
            localizedFields;
        }
        if (proposal.credits) {
          if (!Array.isArray(existing.credits))
            return reply({ error: "Published metadata unavailable." }, 503);
          const rows = existing.credits as Record<string, unknown>[];
          (comparison as { credits?: unknown }).credits = proposal.credits.map(
            (credit) => ({
              ...credit,
              present: rows.some(
                (row) =>
                  typeof row.organizationId === "string" &&
                  row.organizationId.toLowerCase() ===
                    credit.organizationId.toLowerCase() &&
                  row.role === credit.role &&
                  (typeof row.releaseId === "string"
                    ? row.releaseId.toLowerCase()
                    : row.releaseId) ===
                    (credit.releaseId?.toLowerCase() ?? null) &&
                  row.region === credit.region,
              ),
            }),
          );
        }
        if (proposal.platformIds) {
          if (!Array.isArray(existing.releases))
            return reply({ error: "Published metadata unavailable." }, 503);
          const rows = existing.releases as Record<string, unknown>[];
          (comparison as { platforms?: unknown }).platforms =
            proposal.platformIds.map((id) => ({
              id,
              present: rows.some(
                (row) =>
                  typeof row.platformId === "string" &&
                  row.platformId.toLowerCase() === id.toLowerCase(),
              ),
            }));
        }
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
