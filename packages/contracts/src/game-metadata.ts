export const termKinds = [
  "organization",
  "platform",
  "genre",
  "theme",
  "perspective",
  "mode",
] as const;
export type TermKind = (typeof termKinds)[number];
export interface CatalogTerm {
  id: string;
  kind: TermKind;
  name: string;
}
export const gameTypes = [
  "game",
  "dlc",
  "expansion",
  "standalone_expansion",
  "remake",
  "remaster",
  "compilation",
  "edition",
] as const;
export const releaseStates = [
  "announced",
  "early_access",
  "released",
  "cancelled",
] as const;
export interface GameMetadata {
  primaryLanguage: string;
  originalTitle: string;
  gameType: (typeof gameTypes)[number];
  localizations: {
    language: string;
    title: string;
    summary: string;
    description: string;
    aliases: string[];
  }[];
  credits: {
    organizationId: string;
    role: "developer" | "publisher" | "support" | "porting" | "distributor";
    releaseId: string | null;
    region: string | null;
  }[];
  releases: {
    id: string;
    platformId: string;
    edition: string;
    region: string;
    announcedDate: string;
    releaseDate: string;
    status: (typeof releaseStates)[number];
    availability: "unknown" | "available" | "delisted" | "service_ended";
    storeUrl: string;
  }[];
  languages: {
    language: string;
    releaseId: string | null;
    interface: boolean | null;
    subtitles: boolean | null;
    audio: boolean | null;
  }[];
  classifications: string[];
}
export interface MetadataRevision {
  id: string;
  sequence: number;
  status: "pending" | "approved";
  createdAt: string;
  source: string;
  confidence: number;
  reason: string;
  data: GameMetadata;
}
export interface GameMetadataPage {
  revision: MetadataRevision | null;
  approvedRevisionId: string | null;
  baseline: {
    title: string;
    language: string;
    description: string;
    source: string;
    localizations?: GameMetadata["localizations"];
  } | null;
}
