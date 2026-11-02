import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { PageHeading } from "@knowngdb/ui/workspace";
import { GameMetadataEditor } from "./game-metadata.tsx";
import type { AdminRole } from "@knowngdb/contracts";
type ManagedGame = {
  id: string;
  title: string;
  language: string;
  status: string;
  updatedAt: string;
  sourceReference: string;
  titleReview: string;
};
export function GamesView({
  role,
  revision,
  onChanged,
  gameId,
  visibility = false,
  onDirtyChange,
}: {
  role: AdminRole;
  revision: number;
  onChanged: () => void;
  gameId?: string;
  visibility?: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [games, setGames] = useState<ManagedGame[]>([]),
    [loaded, setLoaded] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState("");
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/v1/admin/games", { signal: c.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Games unavailable.");
        if (!c.signal.aborted) {
          setGames(d.games);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setMessage(e.message);
      });
    return () => c.abort();
  }, [revision, role]);
  useEffect(() => {
    onDirtyChange(false);
  }, [gameId, visibility, onDirtyChange]);
  const game = games.find((g) => g.id === gameId);
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!game || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/v1/admin/games", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: game.id,
          expectedUpdatedAt: game.updatedAt,
          status: new FormData(event.currentTarget).get("status"),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Status could not be saved.");
      onChanged();
      setMessage(
        "Game visibility updated. Asset versions retain their individual publication states.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }
  if (gameId)
    return (
      <>
        <PageHeading
          title={visibility ? "Game visibility" : "Game details"}
          back="#/games"
          description={game?.title ?? "Loading game…"}
          action={
            <a
              className="button secondary"
              href={
                visibility
                  ? `#/games/${gameId}`
                  : `#/games/${gameId}/visibility`
              }
            >
              {visibility ? "Edit metadata" : "Manage visibility"}
            </a>
          }
        />
        {message ? <p role="status">{message}</p> : null}
        {!loaded ? (
          <p>Loading game…</p>
        ) : !game ? (
          <p>Game not found. Return to the game list.</p>
        ) : visibility ? (
          <section className="surface narrow">
            <h2>Game visibility</h2>
            <p>
              Current status: <strong>{game.status}</strong>
            </p>
            <p>
              Draft and withdrawn games are hidden from the public catalog.
              Restoring a published game restores access to its previously
              published assets.
            </p>
            <p>
              Withdrawal preserves the canonical game, original files and audit
              history.
            </p>
            <dl>
              <dt>Primary title review</dt>
              <dd>{game.titleReview}</dd>
              <dt>Source</dt>
              <dd>{game.sourceReference}</dd>
            </dl>
            {role === "super_admin" ? (
              <form
                className="stack-form"
                key={game.updatedAt}
                onSubmit={(e) => void change(e)}
              >
                <label>
                  New game status
                  <select
                    aria-label="New game status"
                    name="status"
                    defaultValue={game.status}
                    disabled={busy}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">
                      Published — approve primary title
                    </option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </label>
                <label className="check-label">
                  <input type="checkbox" required disabled={busy} />I reviewed
                  the title, source and visibility change.
                </label>
                <button disabled={busy}>Save game status</button>
              </form>
            ) : (
              <p>Only Super Admins can change visibility.</p>
            )}
          </section>
        ) : (
          <GameMetadataEditor
            key={gameId}
            gameId={gameId}
            role={role}
            onChanged={onChanged}
            onDirtyChange={onDirtyChange}
          />
        )}
      </>
    );
  return (
    <>
      <PageHeading
        title="Games"
        description="Choose a game to edit its information or manage visibility."
        action={
          <a className="button" href="#/games/new">
            <Plus size={18} aria-hidden="true" />
            Add a game
          </a>
        }
      />
      <div className="list-toolbar">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Filter games"
            placeholder="Filter games by title"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="secondary" onClick={onChanged}>
          Refresh games
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
      <div className="surface game-table">
        <div className="game-table-head">
          <span>Game</span>
          <span>Status</span>
          <span>Language</span>
          <span />
        </div>
        {games
          .filter((g) => g.title.toLowerCase().includes(query.toLowerCase()))
          .map((g) => (
            <a className="game-table-row" key={g.id} href={`#/games/${g.id}`}>
              <strong>{g.title}</strong>
              <span className={`status-tag status-${g.status}`}>
                {g.status}
              </span>
              <span>{g.language}</span>
              <ChevronRight size={18} aria-hidden="true" />
            </a>
          ))}
        {!loaded ? (
          <p>Loading games…</p>
        ) : !games.some((g) =>
            g.title.toLowerCase().includes(query.toLowerCase()),
          ) ? (
          <p>No matching games.</p>
        ) : null}
      </div>
    </>
  );
}
