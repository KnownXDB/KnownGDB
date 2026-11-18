import { createClient } from "@supabase/supabase-js";
import type { ApiEnvironment } from "./handler.ts";
const item =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function catalogCovers(request: Request, env: ApiEnvironment) {
  if (request.method !== "GET")
    return reply({ error: "Method not allowed." }, 405);
  const params = new URL(request.url).searchParams;
  const items = params.getAll("item");
  if (
    !items.length ||
    items.length > 50 ||
    [...params.keys()].some((key) => key !== "item") ||
    items.some((value) => !item.test(value))
  )
    return reply({ error: "Provide up to 50 localized catalog items." }, 400);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    return reply({ error: "Catalog unavailable." }, 503);
  const requested = [...new Set(items)].map((value) => {
    const [game_id, language] = value.split(":");
    return { game_id, language };
  });
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
    });
    const { data, error } = await client
      .schema("catalog")
      .rpc("public_catalog_covers", { requested })
      .abortSignal(request.signal);
    if (error) throw error;
    return reply({ covers: data });
  } catch {
    return reply({ error: "Artwork unavailable." }, 503);
  }
}
