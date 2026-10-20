export const assetRoles = [
  "header",
  "capsule",
  "hero",
  "logo",
  "icon",
  "client_icon",
  "store_image",
  "in_game_image",
  "promotional_artwork",
  "trailer",
] as const;
export type AssetRole = (typeof assetRoles)[number];
export type CreditKind = "official" | "platform" | "personal";
export type AdminRole = "super_admin" | "moderator";
export interface GameSummary {
  id: string;
  title: string;
  language: string;
}
export interface Health {
  service: string;
  status: "ok";
  catalogConfigured: boolean;
}
export interface AssetVersion {
  id: string;
  gameId: string;
  role: AssetRole;
  languageKind: "global" | "localized";
  languages: string[];
  context: string;
  createdAt: string;
  validFrom: string | null;
  validUntil: string | null;
  moderation: "submitted" | "in_review" | "approved" | "rejected" | "withdrawn";
  published: boolean;
  rightsVerified: boolean;
}
export interface VersionSummary extends AssetVersion {
  collectionId: string;
  revision: number;
  provenance: "official" | "community";
  credit: { kind: CreditKind; label: string };
  storageVerified: boolean;
  canPublish: boolean;
  changeReason?: string;
}
export interface VersionPage {
  versions: VersionSummary[];
  nextCursor: string | null;
}
