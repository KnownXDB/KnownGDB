import { memo, useState } from "react";
import { ImageOff } from "lucide-react";
import type { GameSummary } from "@knowngdb/contracts";

export const GameCard = memo(function GameCard({
  game,
  artwork,
  priority,
}: {
  game: GameSummary;
  artwork?: string | null;
  priority: boolean;
}) {
  const [failedVersion, setFailedVersion] = useState("");
  const [loadedVersion, setLoadedVersion] = useState("");
  const failed = failedVersion === artwork;
  const loaded = loadedVersion === artwork;
  return (
    <a href={`/games/${game.id}/${game.language}`} className="catalog-card">
      <div className="catalog-card-art">
        {artwork && !failed ? (
          <img
            src={`/api/v1/asset-versions/${artwork}/thumbnail`}
            alt=""
            className={loaded ? "" : "is-loading"}
            width={360}
            height={540}
            onLoad={() => setLoadedVersion(artwork)}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            onError={() => setFailedVersion(artwork)}
          />
        ) : artwork === undefined ? null : (
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
});
