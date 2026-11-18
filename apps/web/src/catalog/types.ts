import type { GameSummary } from "@knowngdb/contracts";

export type Artwork = {
  gameId: string;
  versionId: string;
  role: string;
  languageKind: string;
  languages: string[];
};

export type CatalogPayload = { games: GameSummary[]; artwork: Artwork[] };

export type GameSearchPayload = CatalogPayload;
