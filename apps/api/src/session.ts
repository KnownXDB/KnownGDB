import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { createClient, type Session } from "@supabase/supabase-js";
import type { ApiEnvironment } from "./handler.ts";

interface CookieSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  deadline: number;
}
const lifetime = 7 * 24 * 60 * 60;
const renewals = new Map<
  string,
  Promise<{
    data: { session: Session | null };
    error: { status?: number } | null;
  }>
>();
const cookieName = (request: Request) =>
  new URL(request.url).protocol === "https:"
    ? "__Host-knowngdb-session"
    : "knowngdb-local-session";
const cookieOptions = (request: Request) =>
  `; Path=/; HttpOnly; SameSite=Strict${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
const key = (env: ApiEnvironment) => {
  if (!env.SESSION_SECRET || !/^[A-Za-z0-9_-]{43}$/.test(env.SESSION_SECRET))
    throw Error("Session configuration unavailable");
  const value = Buffer.from(env.SESSION_SECRET, "base64url");
  if (value.length !== 32) throw Error("Session configuration unavailable");
  return value;
};
export function clearSession(request: Request, response: Response) {
  response.headers.set(
    "Set-Cookie",
    `${cookieName(request)}=; Max-Age=0${cookieOptions(request)}`,
  );
  return response;
}
export function issueSession(
  request: Request,
  env: ApiEnvironment,
  session: Session,
  response: Response,
  deadline = Math.floor(Date.now() / 1000) + lifetime,
) {
  const stored: CookieSession = {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? 0,
    deadline,
  };
  if (!stored.accessToken || !stored.refreshToken || !stored.expiresAt)
    throw Error("Invalid session");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(env), iv);
  cipher.setAAD(Buffer.from(cookieName(request)));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(stored), "utf8"),
    cipher.final(),
  ]);
  const value = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64url",
  );
  if (value.length > 3800) throw Error("Session exceeds cookie capacity");
  response.headers.set(
    "Set-Cookie",
    `${cookieName(request)}=${value}; Max-Age=${Math.max(0, deadline - Math.floor(Date.now() / 1000))}${cookieOptions(request)}`,
  );
  return response;
}
const failure = (message: string, status: number) =>
  Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
export async function withSession(
  request: Request,
  env: ApiEnvironment,
  next: (request: Request) => Promise<Response>,
): Promise<Response> {
  const cookies = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((value) => value.trim());
  const matches = cookies.filter((value) =>
    value.startsWith(cookieName(request) + "="),
  );
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== new URL(request.url).origin) ||
    (matches.length &&
      !["GET", "HEAD"].includes(request.method) &&
      origin !== new URL(request.url).origin)
  )
    return failure("Cross-origin request rejected.", 403);
  if (!matches.length) return next(request);
  let stored: CookieSession;
  try {
    if (matches.length !== 1) throw Error("Ambiguous session");
    const value = matches[0].slice(cookieName(request).length + 1);
    if (value.length > 3800 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw Error("Invalid cookie");
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(env),
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(cookieName(request)));
    decipher.setAuthTag(bytes.subarray(12, 28));
    stored = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    );
    if (
      typeof stored.accessToken !== "string" ||
      typeof stored.refreshToken !== "string" ||
      !Number.isFinite(stored.expiresAt) ||
      !Number.isFinite(stored.deadline) ||
      stored.deadline <= Date.now() / 1000
    )
      throw Error("Expired session");
  } catch {
    return clearSession(request, failure("Sign in again to continue.", 401));
  }
  try {
    let refreshed: Session | null = null;
    if (stored.expiresAt <= Date.now() / 1000 + 60) {
      if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
        return failure("Session service is unavailable.", 503);
      const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const renewalKey = createHash("sha256")
        .update(
          `${env.SUPABASE_URL}:${env.SESSION_SECRET}:${stored.refreshToken}`,
        )
        .digest("hex");
      let renewal = renewals.get(renewalKey);
      if (!renewal) {
        if (renewals.size >= 256)
          return failure("Session renewal is temporarily unavailable.", 503);
        renewal = client.auth
          .refreshSession({ refresh_token: stored.refreshToken })
          .finally(() => {
            renewals.delete(renewalKey);
          });
        renewals.set(renewalKey, renewal);
      }
      const result = await renewal;
      if (result.error || !result.data.session) {
        if (
          result.error &&
          (!result.error.status ||
            result.error.status === 429 ||
            result.error.status >= 500)
        )
          return failure("Session renewal is temporarily unavailable.", 503);
        return clearSession(
          request,
          failure("Your session expired. Sign in again.", 401),
        );
      }
      refreshed = result.data.session;
      stored.accessToken = refreshed.access_token;
    }
    const headers = new Headers(request.headers);
    headers.set("authorization", `Bearer ${stored.accessToken}`);
    const response = await next(new Request(request, { headers }));
    if (response.status === 401) return clearSession(request, response);
    if (refreshed && !response.headers.has("Set-Cookie"))
      return issueSession(request, env, refreshed, response, stored.deadline);
    return response;
  } catch {
    return failure("Session service is temporarily unavailable.", 503);
  }
}
