import { createClient } from "@supabase/supabase-js";
import type { ApiEnvironment } from "./handler.ts";
import { issueSession, clearSession } from "./session.ts";
import { isJsonRequest, readJsonObject } from "./request-body.ts";

export const accountPaths = [
  "/api/v1/account/login",
  "/api/v1/account/signup",
  "/api/v1/account/logout",
  "/api/v1/account/profile",
  "/api/v1/account/recover",
  "/api/v1/account/password",
  "/api/v1/account/session",
];
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function accountRequest(
  request: Request,
  env: ApiEnvironment,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const expected = path.endsWith("session")
    ? ["GET"]
    : path.endsWith("profile")
      ? ["GET", "PUT"]
      : ["POST"];
  if (!expected.includes(request.method))
    return reply({ error: "Method not allowed." }, 405);
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return reply({ error: "Cross-origin request rejected." }, 403);
    if (!isJsonRequest(request))
      return reply({ error: "JSON body required." }, 415);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Account service is not configured." }, 503);
  try {
    let body: Record<string, unknown> = {};
    if (request.method !== "GET") {
      const parsed = await readJsonObject(request);
      if (parsed instanceof Response) return parsed;
      body = parsed;
    }
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (path.endsWith("recover")) {
      const email = typeof body.email === "string" ? body.email.trim() : "";
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254 ||
        Object.keys(body).some((key) => key !== "email")
      )
        return reply({ error: "Enter a valid email address." }, 400);
      let redirect: URL;
      try {
        redirect = new URL(env.ACCOUNT_RECOVERY_URL ?? "");
      } catch {
        return reply({ error: "Password recovery is not configured." }, 503);
      }
      if (
        redirect.username ||
        redirect.password ||
        redirect.hash ||
        !(
          redirect.protocol === "https:" ||
          (redirect.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(redirect.hostname))
        )
      )
        return reply({ error: "Password recovery is not configured." }, 503);
      const result = await client.auth.resetPasswordForEmail(email, {
        redirectTo: redirect.href,
      });
      if (result.error)
        return reply(
          {
            error:
              result.error.status === 429
                ? "Too many attempts. Try again later."
                : "Recovery email could not be requested. Try again later.",
          },
          result.error.status === 429 ? 429 : 503,
        );
      return reply({
        message:
          "If an account exists for this email, a recovery link has been requested. Check your inbox and spam folder.",
      });
    }
    if (path.endsWith("password")) {
      const token = request.headers
        .get("authorization")
        ?.match(/^Bearer (\S+)$/)?.[1];
      if (!token)
        return reply(
          { error: "Open a valid recovery link from your email." },
          401,
        );
      const { password, refreshToken } = body;
      if (
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128 ||
        typeof refreshToken !== "string" ||
        !refreshToken ||
        refreshToken.length > 1024 ||
        Object.keys(body).some(
          (key) => !["password", "refreshToken"].includes(key),
        )
      )
        return reply(
          {
            error:
              "Use a password of 8 to 128 characters and a valid recovery session.",
          },
          400,
        );
      const verified = await client.auth.getUser(token);
      if (verified.error || !verified.data.user?.email_confirmed_at)
        return reply(
          { error: "Recovery link is invalid or expired. Request a new link." },
          401,
        );
      const session = await client.auth.setSession({
        access_token: token,
        refresh_token: refreshToken,
      });
      if (session.error || session.data.user?.id !== verified.data.user.id)
        return reply(
          { error: "Recovery link is invalid or expired. Request a new link." },
          401,
        );
      const updated = await client.auth.updateUser({ password });
      if (updated.error)
        return reply(
          {
            error:
              "Unable to update the password. Use a different password or request a new recovery link.",
          },
          400,
        );
      const revoked = await client.auth.signOut({ scope: "global" });
      return clearSession(
        request,
        reply({ passwordUpdated: true, sessionsRevoked: !revoked.error }),
      );
    }
    if (path.endsWith("login") || path.endsWith("signup")) {
      const { email, password } = body;
      if (
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254 ||
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128
      )
        return reply(
          {
            error: "Enter a valid email and a password of 8 to 128 characters.",
          },
          400,
        );
      if (
        !env.SESSION_SECRET ||
        !/^[A-Za-z0-9_-]{43}$/.test(env.SESSION_SECRET)
      )
        return reply({ error: "Persistent sessions are not configured." }, 503);
      const result = path.endsWith("signup")
        ? await client.auth.signUp({ email, password })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error)
        return reply(
          {
            error:
              result.error.status === 429
                ? "Too many attempts. Try again later."
                : "Unable to authenticate. Check your credentials and email confirmation.",
          },
          result.error.status === 429 ? 429 : 401,
        );
      const session = result.data.session;
      return session
        ? issueSession(request, env, session, reply({ authenticated: true }))
        : reply({ confirmationRequired: true });
    }
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (\S+)$/)?.[1];
    if (!token)
      return path.endsWith("logout")
        ? clearSession(request, reply({ signedOut: true }))
        : reply({ error: "Authentication required." }, 401);
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);
    if (error && (!error.status || error.status >= 500 || error.status === 429))
      return reply(
        { error: "Identity verification is temporarily unavailable." },
        503,
      );
    if (error || !user || !user.email_confirmed_at)
      return reply({ error: "Authentication required." }, 401);
    if (path.endsWith("session")) {
      const [profile, membership] = await Promise.all([
        client
          .schema("catalog")
          .from("contributor_profiles")
          .select("display_name")
          .eq("user_id", user.id)
          .maybeSingle(),
        client
          .schema("catalog")
          .from("admin_members")
          .select("role")
          .eq("user_id", user.id)
          .eq("active", true)
          .maybeSingle(),
      ]);
      if (profile.error || membership.error)
        return reply(
          { error: "Account details are temporarily unavailable." },
          503,
        );
      const role = ["super_admin", "moderator"].includes(membership.data?.role)
        ? (membership.data?.role ?? null)
        : null;
      return reply({
        authenticated: true,
        profile: profile.data
          ? { displayName: profile.data.display_name }
          : null,
        role,
      });
    }
    if (path.endsWith("logout")) {
      const result = await client.auth.admin.signOut(token, "local");
      return clearSession(
        request,
        result.error
          ? reply({ error: "Session revocation is unavailable." }, 503)
          : reply({ signedOut: true }),
      );
    }
    const profiles = client.schema("catalog").from("contributor_profiles");
    if (request.method === "PUT") {
      const name =
        typeof body.displayName === "string"
          ? body.displayName.trim().normalize("NFC")
          : "";
      if (
        !name ||
        name.length > 80 ||
        /[\p{Cc}\p{Cf}<>]/u.test(name) ||
        Object.keys(body).some((key) => key !== "displayName")
      )
        return reply(
          {
            error:
              "Use a public name of 1 to 80 characters without markup or control characters.",
          },
          400,
        );
      const result = await profiles
        .upsert(
          { user_id: user.id, display_name: name },
          { onConflict: "user_id" },
        )
        .select("display_name")
        .single();
      return result.error
        ? reply({ error: "Unable to save your public profile." }, 503)
        : reply({ profile: { displayName: result.data.display_name } });
    }
    const result = await profiles
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    return result.error
      ? reply({ error: "Unable to load your public profile." }, 503)
      : reply({
          profile: result.data
            ? { displayName: result.data.display_name }
            : null,
        });
  } catch {
    return reply({ error: "Account service is temporarily unavailable." }, 503);
  }
}
