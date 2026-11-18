import { FeedbackHost } from "@knowngdb/ui/feedback";
import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Search, ImageOff } from "lucide-react";
import type { GameSummary } from "@knowngdb/contracts";
import {
  Workspace,
  PageHeading,
  useWorkspaceRoute,
} from "@knowngdb/ui/workspace";
import { startsInRecovery } from "@knowngdb/ui/recovery-state";
import "@knowngdb/ui/workspace.css";
import "./catalog.css";
const Account = lazy(() =>
  import("@knowngdb/ui/account").then((module) => ({
    default: module.Account,
  })),
);
const AssetSubmission = lazy(() =>
  import("@knowngdb/ui/submission").then((module) => ({
    default: module.AssetSubmission,
  })),
);
const PublishedVersions = lazy(() =>
  import("./versions.tsx").then((module) => ({
    default: module.PublishedVersions,
  })),
);
const PublishedGameMetadata = lazy(() =>
  import("./game-metadata.tsx").then((module) => ({
    default: module.PublishedGameMetadata,
  })),
);
const Developers = lazy(() =>
  import("./developers.tsx").then((module) => ({ default: module.Developers })),
);
type Artwork = {
  gameId: string;
  versionId: string;
  role: string;
  languageKind: string;
  languages: string[];
};
const artworkHintsKey = "knowngdb.catalog.artwork-hints.v2";
const artworkId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const artworkHintLifetime = 5 * 60_000;
function readArtworkHints(): Artwork[] {
  try {
    const data = JSON.parse(sessionStorage.getItem(artworkHintsKey) ?? "null");
    if (
      !data ||
      !Number.isFinite(data.savedAt) ||
      data.savedAt > Date.now() ||
      Date.now() - data.savedAt >= artworkHintLifetime ||
      !Array.isArray(data.artwork)
    )
      return [];
    return data.artwork
      .slice(0, 12)
      .filter(
        (item: Artwork) =>
          item &&
          typeof item.gameId === "string" &&
          artworkId.test(item.gameId) &&
          typeof item.versionId === "string" &&
          artworkId.test(item.versionId) &&
          ["capsule", "header", "hero"].includes(item.role) &&
          ["global", "localized"].includes(item.languageKind) &&
          Array.isArray(item.languages) &&
          item.languages.every(
            (language: unknown) => typeof language === "string",
          ),
      );
  } catch {
    return [];
  }
}
function preloadArtworkHints() {
  for (const item of readArtworkHints()) {
    const image = new Image();
    image.src = `/api/v1/asset-versions/${item.versionId}/thumbnail`;
  }
}
function rememberArtworkHints(games: GameSummary[], artwork: Artwork[]) {
  try {
    const ranks: Record<string, number> = { capsule: 0, header: 1, hero: 2 };
    const selected = games.flatMap((game) => {
      const item = artwork
        .filter(
          (item) =>
            item.gameId === game.id &&
            (item.languageKind === "global" ||
              item.languages.some(
                (language) =>
                  language.toLowerCase() === game.language.toLowerCase(),
              )),
        )
        .sort((a, b) => (ranks[a.role] ?? 9) - (ranks[b.role] ?? 9))[0];
      return item && artworkId.test(item.versionId) ? [item] : [];
    });
    sessionStorage.setItem(
      artworkHintsKey,
      JSON.stringify({ savedAt: Date.now(), artwork: selected.slice(0, 12) }),
    );
  } catch {
    // The catalog remains functional without browser storage.
  }
}
function GameCard({
  game,
  artwork,
  artworkPending,
  priority,
}: {
  game: GameSummary;
  artwork?: Artwork;
  artworkPending: boolean;
  priority: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [artwork?.versionId]);
  return (
    <a href={`/games/${game.id}/${game.language}`} className="catalog-card">
      <div className="catalog-card-art">
        {artwork && !failed ? (
          <img
            src={
              priority
                ? "/api/v1/catalog/featured-artwork"
                : `/api/v1/asset-versions/${artwork.versionId}/thumbnail`
            }
            alt=""
            className={loaded ? "" : "is-loading"}
            width={360}
            height={540}
            onLoad={() => setLoaded(true)}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            onError={() => setFailed(true)}
          />
        ) : artworkPending && !failed ? (
          <span className="catalog-card-loading" aria-hidden="true" />
        ) : (
          <span className="catalog-card-placeholder">
            <ImageOff size={24} aria-hidden="true" />
            <span>Artwork unavailable</span>
          </span>
        )}
      </div>
      <div className="catalog-card-info">
        <strong>{game.title}</strong>
        <span>
          {(game.itemType ?? "game").replaceAll("_", " ")} ·{" "}
          {game.language.toUpperCase()}
        </span>
      </div>
    </a>
  );
}
function App() {
  const [dirty, setDirty] = useState(false);
  const [adminAccess, setAdminAccess] = useState(false);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = async () => {
      const current = ++revision;
      try {
        const response = await fetch("/api/v1/account/session", {
          credentials: "same-origin",
        });
        const session = response.ok ? await response.json() : null;
        if (active && current === revision)
          setAdminAccess(
            session?.authenticated === true &&
              ["super_admin", "moderator"].includes(session.role),
          );
      } catch {
        if (active && current === revision) setAdminAccess(false);
      }
    };
    void refresh();
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("knowngdb-account")
        : null;
    if (channel) channel.onmessage = () => void refresh();
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("knowngdb-session-changed", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      channel?.close();
      window.removeEventListener("knowngdb-session-changed", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  const route = useWorkspaceRoute(startsInRecovery ? "/account" : "/", dirty),
    parts = route.split("/");
  const [query, setQuery] = useState(""),
    [games, setGames] = useState<GameSummary[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [detailTab, setDetailTab] = useState("assets"),
    [artwork, setArtwork] = useState<Artwork[]>([]),
    [artworkPending, setArtworkPending] = useState(true),
    [catalogRevision, setCatalogRevision] = useState(0);
  useEffect(() => {
    if (
      window.location.pathname === "/" ||
      window.location.pathname === "/browse"
    )
      preloadArtworkHints();
  }, []);
  useEffect(() => {
    if (route !== "/") return;
    const refresh = () => {
      if (document.visibilityState === "visible")
        setCatalogRevision((value) => value + 1);
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [route]);
  useEffect(() => {
    const isHome = route === "/";
    const isGame = parts[1] === "games" && Boolean(parts[2]);
    if (!isHome && !isGame) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setLoading(true);
        setError("");
        try {
          const isSearch = isHome && Boolean(query.trim());
          const response = await fetch(
            isGame
              ? `/api/v1/catalog/games/${encodeURIComponent(parts[2])}?language=${encodeURIComponent(parts[3] ?? "en")}`
              : isSearch
                ? `/api/v1/games?q=${encodeURIComponent(query.trim())}`
                : "/api/v1/catalog/home",
            { signal: controller.signal },
          );
          const data = await response.json();
          if (!response.ok) throw Error(data.error || "Catalog unavailable.");
          if (controller.signal.aborted) return;
          const gameList: GameSummary[] = isGame
            ? data.game
              ? [data.game]
              : []
            : data.games;
          setGames(gameList);
          if (isHome && !isSearch) {
            setArtwork(data.artwork);
            rememberArtworkHints(gameList, data.artwork);
            setArtworkPending(false);
          } else if (isSearch) {
            setArtwork([]);
            setArtworkPending(true);
          } else {
            setArtwork([]);
            setArtworkPending(false);
          }
          setLoading(false);
          const ids = isSearch
            ? [...new Set<string>(gameList.map((game) => game.id))]
            : [];
          if (ids.length) {
            try {
              const pictures = await fetch(
                `/api/v1/catalog/artwork?ids=${ids.join(",")}`,
                { signal: controller.signal },
              );
              if (pictures.ok) {
                const result = await pictures.json();
                if (!controller.signal.aborted) {
                  setArtwork(result.artwork);
                  if (isHome && !query.trim())
                    rememberArtworkHints(gameList, result.artwork);
                }
              } else if (!controller.signal.aborted) {
                setArtwork([]);
              }
            } catch {
              if (!controller.signal.aborted) setArtwork([]);
            }
          }
          if (!controller.signal.aborted) setArtworkPending(false);
        } catch (error) {
          if (!controller.signal.aborted) {
            setArtwork([]);
            setArtworkPending(false);
            setError(
              error instanceof Error ? error.message : "Catalog unavailable.",
            );
          }
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      query.trim() ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, catalogRevision, route]);
  function search(event: FormEvent) {
    event.preventDefault();
  }
  function cardArtwork(game: GameSummary) {
    const ranks: Record<string, number> = { capsule: 0, header: 1, hero: 2 };
    return artwork
      .filter(
        (item) =>
          item.gameId === game.id &&
          (item.languageKind === "global" ||
            item.languages.some(
              (language) =>
                language.toLowerCase() === game.language.toLowerCase(),
            )),
      )
      .sort((a, b) => (ranks[a.role] ?? 9) - (ranks[b.role] ?? 9))[0];
  }
  const game =
    games.find((g) => g.id === parts[2] && g.language === parts[3]) ??
    games.find((g) => g.id === parts[2]);
  const priorityIndex = games.findIndex((item) => cardArtwork(item));
  return (
    <Workspace route={route} adminAccess={adminAccess}>
      <Suspense fallback={<div className="route-loading" aria-hidden="true" />}>
        {route === "/account" ? (
          <div className="account-view">
            <PageHeading
              title="Your account"
              description="Sign in to contribute and manage your public profile."
            />
            <section className="surface">
              <Account />
            </section>
          </div>
        ) : null}
        {route === "/" ? (
          <>
            <section className="catalog-hero" aria-labelledby="catalog-heading">
              <div className="catalog-hero-inner">
                <p className="catalog-brand">KnownGDB</p>
                <h1 id="catalog-heading">Find your next great image.</h1>
                <p>
                  Explore game artwork, originals and the people behind them.
                </p>
                <form
                  className="catalog-search"
                  onSubmit={search}
                  role="search"
                >
                  <label className="catalog-search-input">
                    <Search size={22} aria-hidden="true" />
                    <span className="sr-only">Search games</span>
                    <input
                      aria-label="Search games"
                      maxLength={120}
                      placeholder="Search games"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                </form>
              </div>
            </section>
            <section
              className="catalog-browse"
              aria-labelledby="browse-heading"
            >
              <div className="catalog-browse-heading">
                <div>
                  <h2 id="browse-heading">Explore games</h2>
                  <p>Browse published games and their artwork.</p>
                </div>
                <span role="status">
                  {error ||
                    (loading
                      ? "Updating…"
                      : `${games.length} ${games.length === 1 ? "game" : "games"}`)}
                </span>
              </div>
              <ul className="catalog-grid">
                {games.map((game, index) => (
                  <li key={`${game.id}:${game.language}`}>
                    <GameCard
                      game={game}
                      artwork={cardArtwork(game)}
                      artworkPending={artworkPending}
                      priority={index === priorityIndex}
                    />
                  </li>
                ))}
              </ul>
              {!loading && !error && !games.length ? (
                <div className="empty-state">
                  <h2>No games found</h2>
                  <p>Try a different title.</p>
                </div>
              ) : null}
            </section>
          </>
        ) : route === "/submit" ? (
          <>
            <PageHeading
              title="Submit an asset"
              description="Keep original artwork connected to its game and creator."
            />
            <section className="surface narrow">
              <AssetSubmission standalone onDirtyChange={setDirty} />
            </section>
          </>
        ) : parts[1] === "games" ? (
          <>
            <PageHeading title={game?.title ?? "Game assets"} back="/" />
            <nav className="section-tabs" aria-label="Game information">
              <button
                aria-current={detailTab === "assets" ? "page" : undefined}
                onClick={() => setDetailTab("assets")}
              >
                Assets
              </button>
              <button
                aria-current={detailTab === "information" ? "page" : undefined}
                onClick={() => setDetailTab("information")}
              >
                Game information
              </button>
            </nav>
            <div
              className={
                detailTab === "assets" ? "game-artwork-view" : "surface"
              }
            >
              {detailTab === "assets" ? (
                <PublishedVersions
                  gameId={parts[2]}
                  title={game?.title ?? "Game"}
                />
              ) : (
                <PublishedGameMetadata
                  gameId={parts[2]}
                  language={parts[3] ?? "en"}
                />
              )}
            </div>
          </>
        ) : route !== "/account" ? (
          <PageHeading title="Page not found" back="/" />
        ) : null}
      </Suspense>
    </Workspace>
  );
}
createRoot(document.getElementById("root")!).render(
  window.location.pathname.replace(/\/$/, "") === "/developers" ? (
    <>
      {" "}
      <FeedbackHost />
      <Suspense fallback={<div className="route-loading" aria-hidden="true" />}>
        <Developers />
      </Suspense>{" "}
    </>
  ) : (
    <App />
  ),
);
