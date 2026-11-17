import { FeedbackHost } from "@knowngdb/ui/feedback";
import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Search, ImageOff } from "lucide-react";
import type { GameSummary } from "@knowngdb/contracts";
import {
  Workspace,
  PageHeading,
  useWorkspaceRoute,
} from "@knowngdb/ui/workspace";
import { Account, startsInRecovery } from "@knowngdb/ui/account";
import { AssetSubmission } from "@knowngdb/ui/submission";
import { PublishedVersions } from "./versions.tsx";
import { PublishedGameMetadata } from "./game-metadata.tsx";
import "@knowngdb/ui/workspace.css";
import "./catalog.css";
import { Developers } from "./developers.tsx";
type Artwork = {
  gameId: string;
  versionId: string;
  role: string;
  languageKind: string;
  languages: string[];
};
function GameCard({ game, artwork }: { game: GameSummary; artwork?: Artwork }) {
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
            src={`/api/v1/asset-versions/${artwork.versionId}/thumbnail`}
            alt=""
            className={loaded ? "" : "is-loading"}
            onLoad={() => setLoaded(true)}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
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
    [artwork, setArtwork] = useState<Artwork[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setLoading(true);
        setError("");
        try {
          const response = await fetch(
            `/api/v1/games${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`,
            { signal: controller.signal },
          );
          const data = await response.json();
          if (!response.ok) throw Error(data.error || "Catalog unavailable.");
          if (controller.signal.aborted) return;
          setGames(data.games);
          setArtwork([]);
          setLoading(false);
          const ids = [
            ...new Set<string>(data.games.map((game: GameSummary) => game.id)),
          ];
          if (ids.length) {
            try {
              const pictures = await fetch(
                `/api/v1/catalog/artwork?ids=${ids.join(",")}`,
                { signal: controller.signal },
              );
              if (pictures.ok) {
                const result = await pictures.json();
                if (!controller.signal.aborted) setArtwork(result.artwork);
              }
            } catch {
              /* Keep the catalog usable if artwork is unavailable. */
            }
          }
        } catch (error) {
          if (!controller.signal.aborted)
            setError(
              error instanceof Error ? error.message : "Catalog unavailable.",
            );
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
  }, [query]);
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
  return (
    <Workspace route={route} adminAccess={adminAccess}>
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
              <p>Explore game artwork, originals and the people behind them.</p>
              <form className="catalog-search" onSubmit={search} role="search">
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
          <section className="catalog-browse" aria-labelledby="browse-heading">
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
              {games.map((game) => (
                <li key={`${game.id}:${game.language}`}>
                  <GameCard game={game} artwork={cardArtwork(game)} />
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
            className={detailTab === "assets" ? "game-artwork-view" : "surface"}
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
    </Workspace>
  );
}
createRoot(document.getElementById("root")!).render(
  window.location.pathname.replace(/\/$/, "") === "/developers" ? (
    <>
      {" "}
      <FeedbackHost />
      <Developers />{" "}
    </>
  ) : (
    <App />
  ),
);
