import type { ApiEnvironment } from "./handler.ts";
import { catalogArtwork } from "./catalog-artwork.ts";
import { catalogHome } from "./catalog-home.ts";
import { deliveryRequest } from "./asset-delivery.ts";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const gameRoute = /^\/games\/([0-9a-f-]{36})\/([a-z0-9-]{2,35})$/i;
const emptyArtwork =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><path fill="transparent" d="M0 0h1v1H0z"/></svg>';

function varyByReferer(response: Response) {
  const headers = new Headers(response.headers);
  const vary =
    headers
      .get("Vary")
      ?.split(",")
      .map((value) => value.trim()) ?? [];
  if (!vary.some((value) => value.toLowerCase() === "referer"))
    headers.set("Vary", [...vary, "Referer"].filter(Boolean).join(", "));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function emptyResponse(request: Request) {
  return new Response(request.method === "HEAD" ? null : emptyArtwork, {
    headers: {
      "Cache-Control": "private, max-age=60, must-revalidate",
      "Content-Type": "image/svg+xml",
      "Content-Length": String(new TextEncoder().encode(emptyArtwork).length),
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      Vary: "Referer",
    },
  });
}

export async function catalogFeaturedArtwork(
  request: Request,
  env: ApiEnvironment,
) {
  const url = new URL(request.url);
  if (!new Set(["GET", "HEAD"]).has(request.method))
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  if (url.search)
    return Response.json(
      { error: "Unexpected featured artwork parameters." },
      { status: 400 },
    );

  const referrer = request.headers.get("referer");
  if (!referrer) return emptyResponse(request);
  let source: URL;
  try {
    source = new URL(referrer);
  } catch {
    return emptyResponse(request);
  }
  if (source.origin !== url.origin) return emptyResponse(request);

  let selected:
    | {
        versionId: string;
        role: string;
      }
    | undefined;
  let variant: "thumbnail" | "display" = "thumbnail";
  const gameMatch = gameRoute.exec(source.pathname);
  if (gameMatch && uuid.test(gameMatch[1])) {
    const [, gameId, language] = gameMatch;
    const artworkResponse = await catalogArtwork(
      new Request(
        new URL(
          `/api/v1/catalog/artwork?ids=${encodeURIComponent(gameId)}`,
          url,
        ),
        { method: "GET", signal: request.signal },
      ),
      env,
    );
    if (!artworkResponse.ok) return artworkResponse;
    const { artwork } = (await artworkResponse.json()) as {
      artwork: {
        gameId: string;
        versionId: string;
        role: string;
        languageKind: string;
        languages: string[];
      }[];
    };
    const ranks: Record<string, number> = { hero: 0, header: 1 };
    selected = artwork
      .filter(
        (item) =>
          item.gameId === gameId &&
          uuid.test(item.versionId) &&
          ranks[item.role] !== undefined &&
          (item.languageKind === "global" ||
            item.languages.some(
              (tag) => tag.toLowerCase() === language.toLowerCase(),
            )),
      )
      .sort((a, b) => ranks[a.role] - ranks[b.role])[0];
    variant = "display";
  } else if (source.pathname === "/" || source.pathname === "/browse") {
    const home = await catalogHome(
      new Request(new URL("/api/v1/catalog/home", url), {
        method: "GET",
        signal: request.signal,
      }),
      env,
    );
    if (!home.ok) return home;
    const { games, artwork } = (await home.json()) as {
      games: { id: string; language: string }[];
      artwork: {
        gameId: string;
        versionId: string;
        role: string;
        languageKind: string;
        languages: string[];
      }[];
    };
    const ranks: Record<string, number> = { capsule: 0, header: 1, hero: 2 };
    selected = games
      .map(
        (game) =>
          artwork
            .filter(
              (item) =>
                item.gameId === game.id &&
                (item.languageKind === "global" ||
                  item.languages.some(
                    (tag) => tag.toLowerCase() === game.language.toLowerCase(),
                  )),
            )
            .sort((a, b) => (ranks[a.role] ?? 9) - (ranks[b.role] ?? 9))[0],
      )
      .find(Boolean);
  } else {
    return emptyResponse(request);
  }

  if (!selected) return emptyResponse(request);
  const imageUrl = new URL(
    `/api/v1/asset-versions/${encodeURIComponent(selected.versionId)}/${variant}`,
    url,
  );
  const delivered = await deliveryRequest(
    new Request(imageUrl, {
      method: request.method,
      headers: request.headers.has("if-none-match")
        ? { "If-None-Match": request.headers.get("if-none-match")! }
        : undefined,
      signal: request.signal,
    }),
    env,
  );
  return varyByReferer(delivered);
}
