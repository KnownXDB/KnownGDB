import type { SupabaseClient } from "@supabase/supabase-js";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function verifyAdmin(client: SupabaseClient, request: Request) {
  let actor: string;
  let sessionId: string | undefined;
  let superAdmin = false;
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return reply({ error: "Authentication required." }, 401);
  const verified = await client.auth.getUser(token);
  if (
    verified.error &&
    (!verified.error.status ||
      verified.error.status >= 500 ||
      verified.error.status === 429)
  )
    return reply(
      { error: "Identity verification is temporarily unavailable." },
      503,
    );
  if (verified.error || !verified.data.user?.email_confirmed_at)
    return reply({ error: "Authentication required." }, 401);
  actor = verified.data.user.id;
  const membership = await client
    .schema("catalog")
    .from("admin_members")
    .select("role")
    .eq("user_id", actor)
    .eq("active", true)
    .maybeSingle();
  if (membership.error)
    return reply(
      { error: "Administrative authorization is unavailable." },
      503,
    );
  if (!["super_admin", "moderator"].includes(membership.data?.role))
    return reply({ error: "Administrative permission required." }, 403);
  superAdmin = membership.data?.role === "super_admin";
  try {
    sessionId = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    ).session_id;
  } catch {
    /* Reject tokens without a verified session claim. */
  }
  if (!sessionId || !uuid.test(sessionId))
    return reply({ error: "An active session is required." }, 401);
  const activeSession = await client.rpc("admin_check", {
    p_actor: actor,
    p_session: sessionId,
  });
  if (activeSession.error)
    return reply(
      { error: "Session verification is temporarily unavailable." },
      503,
    );
  if (activeSession.data !== true)
    return reply(
      { error: "An active administrative session is required." },
      401,
    );

  return { actor, sessionId, superAdmin };
}
