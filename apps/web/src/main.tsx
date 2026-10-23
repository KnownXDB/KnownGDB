import { AssetSubmission } from "@knowngdb/ui/submission";
import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import type { GameSummary, Health } from "@knowngdb/contracts";
import "@knowngdb/ui/workspace.css";
import { Account } from "@knowngdb/ui/account";
import { PublishedVersions } from "./versions.tsx";

function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [query, setQuery] = useState("");
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/health", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setHealth)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("The local API is unavailable.");
      });
    return () => controller.abort();
  }, []);
  async function search(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/games?q=${encodeURIComponent(query)}`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setGames(body.games);
      setSelectedGame(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Catalog unavailable.");
      setGames(null);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <header>
        <strong>KnownGDB</strong>
        <span>Public workspace</span>
      </header>
      <main>
        <Account />
        <AssetSubmission />
        <h1>Find your next asset.</h1>
        <p>
          Search published games by title. Each canonical game keeps its own
          identity across languages, artwork and releases.
        </p>
        <form onSubmit={search}>
          <label>
            <span>Game title</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={120}
              placeholder="Search the catalog"
            />
          </label>
          <button disabled={loading}>
            {loading ? "Searching…" : "Search games"}
          </button>
        </form>
        <div aria-live="polite">
          {error ? <p role="alert">{error}</p> : null}
          {games ? (
            <>
              <h2>Published games</h2>
              {games.length ? (
                <ul>
                  {games.map((game) => (
                    <li key={`${game.id}:${game.language}`}>
                      <strong>{game.title}</strong>
                      <br />
                      <small>
                        {game.language} · <code>{game.id}</code>
                      </small>
                      <div>
                        <button
                          onClick={() =>
                            setSelectedGame(
                              selectedGame === `${game.id}:${game.language}`
                                ? null
                                : `${game.id}:${game.language}`,
                            )
                          }
                          aria-expanded={
                            selectedGame === `${game.id}:${game.language}`
                          }
                        >
                          View published versions
                        </button>
                      </div>
                      {selectedGame === `${game.id}:${game.language}` ? (
                        <PublishedVersions
                          gameId={game.id}
                          title={game.title}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No published games match this search.</p>
              )}
            </>
          ) : null}
        </div>
        <h2>Development connection</h2>
        <p>
          {health
            ? `API connected. ${health.catalogConfigured ? "Catalog credentials are configured on the server." : "Add the private API configuration to connect to the real catalog."}`
            : "Connecting to the API…"}
        </p>
        <p>
          Published versions include image previews and original downloads.
          Image submissions require review; video delivery remains planned.
        </p>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
