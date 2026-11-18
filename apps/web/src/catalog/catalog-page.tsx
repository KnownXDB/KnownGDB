import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { coverKey, readCovers, loadCovers } from "./artwork";
import {
  fetchCatalog,
  homeCatalogKey,
  readCatalogCache,
  searchCatalogKey,
} from "./data";
import { GameCard } from "./game-card";
import { SearchBox } from "./search-box";
import { VirtualizedCollection } from "@knowngdb/ui/virtualized-collection";
import type { GameSummary } from "@knowngdb/contracts";
type CatalogPayload = { games: GameSummary[] };
import "./home.css";

const empty: CatalogPayload = { games: [] };

export function CatalogPage() {
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<CatalogPayload>(
    () => readCatalogCache<CatalogPayload>(homeCatalogKey) ?? empty,
  );
  const [loading, setLoading] = useState(
    () => readCatalogCache<CatalogPayload>(homeCatalogKey) === undefined,
  );
  const [error, setError] = useState("");
  const requestSearch = useCallback((value: string) => setQuery(value), []);

  useEffect(() => {
    const controller = new AbortController();
    const key = query ? searchCatalogKey(query) : homeCatalogKey;
    const cached = readCatalogCache<CatalogPayload>(key);
    if (cached) {
      setPayload(cached);
      setLoading(false);
      setError("");
      return;
    }
    if (!payload.games.length) setLoading(true);
    setError("");
    void fetchCatalog<CatalogPayload>(key, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setPayload(data);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error ? reason.message : "Catalog unavailable.",
        );
        setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [query]);

  return (
    <>
      <CatalogHero onSearch={requestSearch} />
      <CatalogResults games={payload.games} loading={loading} error={error} />
    </>
  );
}

const CatalogHero = memo(function CatalogHero({
  onSearch,
}: {
  onSearch: (query: string) => void;
}) {
  return (
    <section className="catalog-hero" aria-labelledby="catalog-heading">
      <div className="catalog-hero-inner">
        <p className="catalog-brand">KnownGDB</p>
        <h1 id="catalog-heading">Find your next great image.</h1>
        <p>Explore game artwork, originals and the people behind them.</p>
        <SearchBox onSearch={onSearch} />
      </div>
    </section>
  );
});

function CatalogResults({
  games,
  loading,
  error,
}: {
  games: GameSummary[];
  loading: boolean;
  error: string;
}) {
  const cached = useMemo(() => readCovers(games), [games]);
  const [resolved, setResolved] = useState<{
    games: GameSummary[];
    covers: Map<string, string | null>;
  }>();
  const covers = resolved?.games === games ? resolved.covers : cached;
  useEffect(() => {
    const controller = new AbortController();
    const missing = games.filter((game) => !cached.has(coverKey(game)));
    if (missing.length) {
      loadCovers(missing, controller.signal)
        .then((found) => {
          if (!controller.signal.aborted)
            setResolved({ games, covers: new Map([...cached, ...found]) });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setResolved({
              games,
              covers: new Map([
                ...cached,
                ...missing.map((game) => [coverKey(game), null] as const),
              ]),
            });
        });
    }
    return () => controller.abort();
  }, [games, cached]);
  const first = games.find((game) => covers.get(coverKey(game)));
  return (
    <section className="catalog-browse" aria-labelledby="browse-heading">
      <div className="catalog-browse-heading">
        <div>
          <h2 id="browse-heading">Explore games</h2>
          <p>Browse published games and their artwork.</p>
        </div>
        <span role="status" aria-live="polite">
          {error ||
            (loading && !games.length
              ? "Loading catalog…"
              : `${games.length} ${games.length === 1 ? "game" : "games"}`)}
        </span>
      </div>
      <div aria-busy={loading}>
        <VirtualizedCollection
          items={games}
          getKey={coverKey}
          label="Published games"
          className="catalog-grid"
          layout="grid"
          estimateRowSizeToken="--sys-virtual-catalog-row-estimate"
          gapToken="--sys-virtual-catalog-gap"
          renderItem={(game) => (
            <GameCard
              game={game}
              artwork={covers.get(coverKey(game))}
              priority={game === first}
            />
          )}
        />
      </div>
      {!loading && !error && !games.length ? (
        <div className="empty-state">
          <h2>No games found</h2>
          <p>Try a different title.</p>
        </div>
      ) : null}
    </section>
  );
}
