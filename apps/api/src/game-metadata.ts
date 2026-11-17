import { createClient } from "@supabase/supabase-js";
import {
  gameTypes,
  releaseStates,
  termKinds,
  type GameMetadata,
} from "@knowngdb/contracts";
import { verifyAdmin } from "./admin-access.ts";
import { readJsonObject } from "./request-body.ts";
import type { ApiEnvironment } from "./handler.ts";

export const metadataBodyLimit = 128 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bad = () => {
  throw Error(
    "Invalid metadata. Check required fields, dates, references and duplicate rows.",
  );
};
const object = (v: unknown, keys: string[]): Record<string, unknown> => {
  if (
    !v ||
    Array.isArray(v) ||
    typeof v !== "object" ||
    Object.keys(v).some((k) => !keys.includes(k)) ||
    keys.some((k) => !(k in v))
  )
    bad();
  return v as Record<string, unknown>;
};
const text = (v: unknown, max: number, required = false): string => {
  if (
    typeof v !== "string" ||
    v.length > max ||
    (required && !v.trim()) ||
    /[\p{Cf}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(v)
  )
    bad();
  return (v as string).trim();
};
const identifier = (v: unknown) => {
  if (typeof v !== "string" || !uuid.test(v)) bad();
  return v as string;
};
const nullableId = (v: unknown) => (v === null ? null : identifier(v));
const list = (v: unknown, max: number): unknown[] => {
  if (!Array.isArray(v) || v.length > max) bad();
  return v as unknown[];
};
const unique = (values: string[]) => {
  if (new Set(values).size !== values.length) bad();
};
const language = (v: unknown) => {
  const s = text(v, 35, true);
  try {
    if (
      s === "und" ||
      Intl.getCanonicalLocales(s)[0]?.toLowerCase() !== s ||
      !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(s)
    )
      bad();
  } catch {
    bad();
  }
  return s;
};
const region = (v: unknown) => {
  const s = text(v, 2, true);
  if (!/^[A-Z]{2}$/.test(s)) bad();
  return s;
};
const choice = <T extends string>(v: unknown, choices: readonly T[]): T => {
  if (!choices.includes(v as T)) bad();
  return v as T;
};
export function partialDate(v: unknown): string {
  const s = text(v, 10);
  if (!s) return s;
  if (!/^[1-9]\d{3}(-\d{2})?(-\d{2})?$/.test(s)) bad();
  const full = s.length === 4 ? `${s}-01-01` : s.length === 7 ? `${s}-01` : s;
  const timestamp = Date.parse(`${full}T00:00:00Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== full
  )
    bad();
  return s;
}
export function validateMetadata(value: unknown): GameMetadata {
  const d = object(value, [
    "primaryLanguage",
    "originalTitle",
    "gameType",
    "localizations",
    "credits",
    "releases",
    "languages",
    "classifications",
  ]);
  const localizations = list(d.localizations, 8).map((v) => {
    const l = object(v, [
      "language",
      "title",
      "summary",
      "description",
      "aliases",
    ]);
    const aliases = list(l.aliases, 20).map((a) => text(a, 300, true));
    unique(aliases.map((a) => a.toLowerCase()));
    return {
      language: language(l.language),
      title: text(l.title, 300, true),
      summary: text(l.summary, 500),
      description: text(l.description, 20000),
      aliases,
    };
  });
  unique(localizations.map((l) => l.language));
  const primaryLanguage = language(d.primaryLanguage);
  if (!localizations.some((l) => l.language === primaryLanguage)) bad();
  const releases = list(d.releases, 50).map((v) => {
    const r = object(v, [
      "id",
      "platformId",
      "edition",
      "region",
      "announcedDate",
      "releaseDate",
      "status",
      "availability",
      "storeUrl",
    ]);
    const storeUrl = text(r.storeUrl, 2000);
    if (storeUrl) {
      try {
        const url = new URL(storeUrl);
        if (url.protocol !== "https:" || url.username || url.password) bad();
      } catch {
        bad();
      }
    }
    return {
      id: identifier(r.id),
      platformId: identifier(r.platformId),
      edition: text(r.edition, 160),
      region: region(r.region),
      announcedDate: partialDate(r.announcedDate),
      releaseDate: partialDate(r.releaseDate),
      status: choice(r.status, releaseStates),
      availability: choice(r.availability, [
        "unknown",
        "available",
        "delisted",
        "service_ended",
      ] as const),
      storeUrl,
    };
  });
  unique(releases.map((r) => r.id));
  const scope = (v: unknown) => {
    const id = nullableId(v);
    if (id && !releases.some((r) => r.id === id)) bad();
    return id;
  };
  const credits = list(d.credits, 50).map((v) => {
    const c = object(v, ["organizationId", "role", "releaseId", "region"]);
    return {
      organizationId: identifier(c.organizationId),
      role: choice(c.role, [
        "developer",
        "publisher",
        "support",
        "porting",
        "distributor",
      ] as const),
      releaseId: scope(c.releaseId),
      region: c.region === null ? null : region(c.region),
    };
  });
  unique(credits.map((c) => JSON.stringify(c)));
  const bool = (v: unknown) => {
    if (v !== null && typeof v !== "boolean") bad();
    return v as boolean | null;
  };
  const languages = list(d.languages, 100).map((v) => {
    const l = object(v, [
      "language",
      "releaseId",
      "interface",
      "subtitles",
      "audio",
    ]);
    return {
      language: language(l.language),
      releaseId: scope(l.releaseId),
      interface: bool(l.interface),
      subtitles: bool(l.subtitles),
      audio: bool(l.audio),
    };
  });
  unique(languages.map((l) => `${l.language}:${l.releaseId}`));
  const classifications = list(d.classifications, 80).map(identifier);
  unique(classifications);
  return {
    primaryLanguage,
    originalTitle: text(d.originalTitle, 300),
    gameType: choice(d.gameType, gameTypes),
    localizations,
    credits,
    releases,
    languages,
    classifications,
  };
}
export const isMetadataRoute = (path: string) =>
  path === "/api/v1/admin/metadata-terms" ||
  /^\/api\/v1\/(admin\/)?games\/[^/]+\/metadata(?:\/approval)?$/.test(path);
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function metadataRequest(request: Request, env: ApiEnvironment) {
  const url = new URL(request.url),
    admin = url.pathname.startsWith("/api/v1/admin/"),
    terms = url.pathname.endsWith("/metadata-terms"),
    approval = url.pathname.endsWith("/approval");
  if (url.search)
    return reply({ error: "Unexpected metadata parameters." }, 400);
  if (
    (!admin && request.method !== "GET") ||
    (approval && request.method !== "POST") ||
    (!approval && !["GET", "POST"].includes(request.method))
  )
    return reply({ error: "Method not allowed." }, 405);
  const game = terms ? null : url.pathname.split("/")[admin ? 5 : 4];
  if (game && !uuid.test(game))
    return reply({ error: "A canonical game identifier is required." }, 400);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog unavailable." }, 503);
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    let args: Record<string, unknown> = { p_game: game };
    if (admin) {
      const access = await verifyAdmin(client, request);
      if (access instanceof Response) return access;
      if (approval && !access.superAdmin)
        return reply({ error: "Super Admin permission required." }, 403);
      args = { ...args, p_actor: access.actor, p_session: access.sessionId };
    }
    let rpc = admin ? "admin_game_metadata" : "published_game_metadata";
    if (terms) {
      rpc = "admin_metadata_terms";
      delete args.p_game;
    }
    if (request.method === "POST") {
      const body = await readJsonObject(
        request,
        terms || approval ? 4096 : metadataBodyLimit,
      );
      if (body instanceof Response) return body;
      try {
        if (terms) {
          const d = object(body, ["kind", "name", "source"]);
          args = {
            ...args,
            p_kind: choice(d.kind, termKinds),
            p_name: text(d.name, 160, true),
            p_source: text(d.source, 2000, true),
          };
        } else if (approval) {
          const d = object(body, ["expectedRevisionId", "reason"]);
          args = {
            ...args,
            p_expected: identifier(d.expectedRevisionId),
            p_reason: text(d.reason, 2000, true),
          };
          rpc = "approve_game_metadata";
        } else {
          const d = object(body, [
            "expectedRevisionId",
            "data",
            "source",
            "confidence",
            "reason",
          ]);
          if (
            typeof d.confidence !== "number" ||
            !Number.isFinite(d.confidence) ||
            d.confidence < 0 ||
            d.confidence > 1
          )
            bad();
          args = {
            ...args,
            p_expected: nullableId(d.expectedRevisionId),
            p_data: validateMetadata(d.data),
            p_source: text(d.source, 2000, true),
            p_confidence: d.confidence,
            p_reason: text(d.reason, 2000, true),
          };
          rpc = "save_game_metadata";
        }
      } catch {
        return reply(
          {
            error:
              "Invalid metadata. Check required fields, dates, references and duplicate rows.",
          },
          400,
        );
      }
    }
    const result = await client.rpc(rpc, args);
    if (result.error) {
      const status =
        (
          {
            "42501": 403,
            "40001": 409,
            "23505": 409,
            "23503": 400,
            "23514": 400,
            "23502": 400,
            "22023": 400,
            P0002: 404,
          } as Record<string, number>
        )[result.error.code] ?? 503;
      return reply(
        {
          error:
            status === 409
              ? "A conflicting revision or catalog term exists. Reload and review before retrying."
              : status === 503
                ? admin
                  ? "Metadata is unavailable. The metadata migration may still require activation."
                  : "Game information is temporarily unavailable."
                : status === 403
                  ? "Administrative permission required."
                  : "Metadata could not be saved. Check the game and field values.",
        },
        status,
      );
    }
    if (!admin && !result.data)
      return reply({ error: "Published metadata not found." }, 404);
    return reply(
      terms
        ? request.method === "GET"
          ? { terms: result.data }
          : { term: result.data }
        : request.method === "POST"
          ? { revisionId: result.data }
          : result.data,
      request.method === "POST" && !approval ? 201 : 200,
    );
  } catch {
    return reply({ error: "Metadata is temporarily unavailable." }, 503);
  }
}
