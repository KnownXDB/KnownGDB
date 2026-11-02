import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Search, ArrowUpRight } from "lucide-react";
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
import { Developers } from "./developers.tsx";
function App() {
  const [dirty, setDirty] = useState(false);
  const route = useWorkspaceRoute(
      startsInRecovery ? "/account" : "/browse",
      dirty,
    ),
    parts = route.split("/");
  const [query, setQuery] = useState(""),
    [games, setGames] = useState<GameSummary[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [detailTab, setDetailTab] = useState("assets");
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/v1/games", { signal: c.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Catalog unavailable.");
        if (!c.signal.aborted) setGames(d.games);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, []);
  async function search(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/v1/games?q=${encodeURIComponent(query)}`),
        d = await r.json();
      if (!r.ok) throw Error(d.error || "Catalog unavailable.");
      setGames(d.games);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Catalog unavailable.");
    } finally {
      setLoading(false);
    }
  }
  const game =
    games.find((g) => g.id === parts[2] && g.language === parts[3]) ??
    games.find((g) => g.id === parts[2]);
  return (
    <Workspace route={route}>
      <div hidden={route !== "/account"} className="account-view">
        <PageHeading
          title="Your account"
          description="Sign in to contribute and manage your public profile."
        />
        <section className="surface">
          <Account />
        </section>
      </div>
      {route === "/browse" ? (
        <>
          <PageHeading
            title="Find game assets"
            description="Browse the catalog, explore original artwork and contribute your own."
          />
          <form className="catalog-search" onSubmit={(e) => void search(e)}>
            <label className="search-field">
              <Search size={22} aria-hidden="true" />
              <input
                aria-label="Search games"
                maxLength={120}
                placeholder="Search games"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button disabled={loading}>
              {loading ? "Searching…" : "Search"}
            </button>
          </form>
          <p role="status">
            {error ||
              (loading
                ? "Loading catalog…"
                : `${games.length} catalog results`)}
          </p>
          <ul className="catalog-results">
            {games.map((g) => (
              <li key={`${g.id}:${g.language}`}>
                <a
                  href={`#/games/${g.id}/${g.language}`}
                  className="catalog-result"
                >
                  <span className="game-initial" aria-hidden="true">
                    {g.title[0]}
                  </span>
                  <div>
                    <h2>{g.title}</h2>
                    <p>Game assets · {g.language}</p>
                  </div>
                  <span className="open-game">
                    Open game
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {!loading && !error && !games.length ? (
            <div className="empty-state">
              <h2>No games found</h2>
              <p>Try a different title.</p>
            </div>
          ) : null}
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
          <PageHeading title={game?.title ?? "Game assets"} back="#/browse" />
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
          <div className="surface">
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
        <PageHeading title="Page not found" back="#/browse" />
      ) : null}
    </Workspace>
  );
}
createRoot(document.getElementById("root")!).render(
  window.location.pathname.replace(/\/$/, "") === "/developers" ? (
    <Developers />
  ) : (
    <App />
  ),
);
