export const imageUploadLimit = 4 * 1024 * 1024;
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
export const catalogItemTypes = [
  "game",
  "demo",
  "playtest",
  "dlc",
  "expansion",
  "standalone_expansion",
  "remake",
  "remaster",
  "compilation",
  "edition",
  "bundle",
  "season_pass",
  "soundtrack",
] as const;
export type CatalogItemType = (typeof catalogItemTypes)[number];
export const catalogRelationTypes = [
  "has_demo",
  "has_playtest",
  "has_dlc",
  "has_expansion",
  "has_standalone_expansion",
  "has_remake",
  "has_remaster",
  "has_edition",
  "has_compilation_member",
  "has_bundle_member",
  "has_season_pass",
  "has_soundtrack",
] as const;
export type CatalogRelationType = (typeof catalogRelationTypes)[number];
export const storeListingRoles = [
  "primary",
  "demo",
  "playtest",
  "dlc",
  "expansion",
  "edition",
  "bundle",
  "season_pass",
  "soundtrack",
  "other",
] as const;
export type StoreListingRole = (typeof storeListingRoles)[number];
export const externalIdentityScopes = [
  "catalog_item",
  "store_listing",
  "release",
  "edition",
  "offer",
  "sku",
  "title",
] as const;
export type ExternalIdentityScope = (typeof externalIdentityScopes)[number];
export type EvidenceStatus =
  "observed" | "in_review" | "verified" | "rejected" | "stale" | "conflicted";
export type EvidenceSourceKind =
  | "official_store_page"
  | "official_api"
  | "publisher_page"
  | "partner_export"
  | "manual_official_review";
export type CreditKind = "official" | "platform" | "personal";
export type AdminRole = "super_admin" | "moderator";
export interface GameSummary {
  id: string;
  title: string;
  language: string;
  itemType: CatalogItemType;
}
export interface StoreListing {
  id: string;
  catalogItemId: string;
  storeProvider: string;
  listingRole: StoreListingRole;
  url: string;
  region: string;
  locale: string | null;
  status: "active" | "delisted" | "unavailable" | "unknown";
  evidenceStatus: EvidenceStatus;
  lastVerifiedAt: string | null;
}
export interface ExternalIdentity {
  id: string;
  catalogItemId: string;
  storeListingId: string | null;
  provider: string;
  namespace: string;
  identifierKind: string;
  value: string;
  scope: ExternalIdentityScope;
  region: string;
  locale: string | null;
  sourceKind: EvidenceSourceKind;
  evidenceStatus: EvidenceStatus;
  confidence: number;
  lastVerifiedAt: string | null;
}
export interface SteamStorePreview {
  provider: "steam";
  appId: string;
  url: string;
  region: string;
  locale: string | null;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  releaseDate: string | null;
  fetchedAt: string;
  sourceKind: "official_store_page";
}
export interface XboxStorePreview {
  provider: "xbox";
  storeId: string;
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  releaseDate: string | null;
  fetchedAt: string;
  sourceKind: "official_store_page";
}
export type EpicStoreIdentityKind =
  "slug" | "namespace" | "catalog_item_id" | "offer_id";
export interface EpicStoreIdentity {
  kind: EpicStoreIdentityKind;
  value: string;
}
export interface EpicStorePreview {
  provider: "epic";
  slug: string;
  url: string;
  locale: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  releaseDate: string | null;
  identities: EpicStoreIdentity[];
  fetchedAt: string;
  sourceKind: "official_store_page";
}
export type EAStoreIdentityKind = "series_slug" | "game_slug";
export interface EAStoreIdentity {
  kind: EAStoreIdentityKind;
  value: string;
}
export interface EAStorePreview {
  provider: "ea";
  seriesSlug: string;
  gameSlug: string;
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  releaseDate: string | null;
  identities: EAStoreIdentity[];
  fetchedAt: string;
  sourceKind: "publisher_page";
}
export type UbisoftStoreIdentityKind = "store_slug" | "product_id" | "sku";
export interface UbisoftStoreIdentity {
  kind: UbisoftStoreIdentityKind;
  value: string;
}
export interface UbisoftStorePreview {
  provider: "ubisoft";
  storeSlug: string;
  region: string;
  locale: string | null;
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  releaseDate: string | null;
  identities: UbisoftStoreIdentity[];
  fetchedAt: string;
  sourceKind: "official_store_page";
}
export type PlayStationStorePageKind = "concept" | "product";
export interface PlayStationStoreIdentity {
  kind: "concept_id" | "product_id";
  value: string;
}
export interface PlayStationStorePreview {
  provider: "playstation";
  pageKind: PlayStationStorePageKind;
  identifier: string;
  locale: string;
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  releaseDate: string | null;
  identities: PlayStationStoreIdentity[];
  fetchedAt: string;
  sourceKind: "official_store_page";
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
  publicationBlockers?: string[];
}
export interface VersionPage {
  versions: VersionSummary[];
  nextCursor: string | null;
}
export * from "./game-metadata.ts";
