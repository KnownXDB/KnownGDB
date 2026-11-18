import { lazy, Suspense, useEffect, useState } from "react";
import { PageHeading } from "@knowngdb/ui/workspace";
import { fetchCatalog, gameCatalogKey, readGameSummary } from "./catalog/data";
import type { GameSummary } from "@knowngdb/contracts";
import "./catalog/game-gallery.css";

import { PublishedVersions } from "./versions";
const PublishedGameMetadata = lazy(() =>
  import("./game-metadata.tsx").then((module) => ({
    default: module.PublishedGameMetadata,
  })),
);

export function GameDetail({
  gameId,
  language,
}: {
  gameId: string;
  language: string;
}) {
  const key = gameCatalogKey(gameId, language);
  const [game, setGame] = useState<GameSummary | undefined>(() =>
    readGameSummary(gameId, language),
  );
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"assets" | "information">("assets");
  const [informationOpened, setInformationOpened] = useState(false);
  useEffect(() => {
    let active = true;
    const cached = readGameSummary(gameId, language);
    if (cached) setGame(cached);
    else
      void fetchCatalog<{ game?: GameSummary }>(key)
        .then((data) => {
          if (active) setGame(data.game);
        })
        .catch(() => {
          if (active) setError("Game details are unavailable.");
        });
    return () => {
      active = false;
    };
  }, [key, gameId, language]);
  return (
    <>
      <PageHeading title={game?.title ?? "Game assets"} back="/" />
      {error && <p role="alert">{error}</p>}
      <nav className="section-tabs" aria-label="Game information">
        <button
          aria-current={tab === "assets" ? "page" : undefined}
          onClick={() => setTab("assets")}
        >
          Assets
        </button>
        <button
          aria-current={tab === "information" ? "page" : undefined}
          onClick={() => {
            setInformationOpened(true);
            setTab("information");
          }}
        >
          Game information
        </button>
      </nav>
      <div
        className={`game-artwork-view${tab === "information" ? " is-hidden" : ""}`}
      >
        <PublishedVersions gameId={gameId} title={game?.title ?? "Game"} />
      </div>
      {informationOpened && (
        <div
          className={`surface game-information-view${tab === "assets" ? " is-hidden" : ""}`}
        >
          <Suspense
            fallback={
              <div className="route-pending" role="status">
                Game information is opening…
              </div>
            }
          >
            <PublishedGameMetadata gameId={gameId} language={language} />
          </Suspense>
        </div>
      )}
    </>
  );
}
