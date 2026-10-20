import {
  assetRoles,
  type AssetVersion,
  type AssetRole,
  type AdminRole,
  type CreditKind,
} from "@knowngdb/contracts";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function languageScope(
  kind: "global" | "localized",
  languages: string[],
): string {
  if (kind === "global") {
    if (languages.length)
      throw new Error("Global assets cannot have languages.");
    return "global";
  }
  if (!languages.length || languages.length > 8)
    throw new Error("Localized assets require one to eight languages.");
  const canonical = languages.map((tag) => {
    if (tag.toLowerCase() === "und" || tag.toLowerCase() === "global")
      throw new Error("A known language is required.");
    return Intl.getCanonicalLocales(tag)[0].toLowerCase();
  });
  if (new Set(canonical).size !== canonical.length)
    throw new Error("Duplicate language tags.");
  return canonical.length === 1 ? canonical[0] : "multi";
}
export function objectKey(input: {
  gameId: string;
  versionId: string;
  provenance: "official" | "community";
  role: AssetRole;
  languageKind: "global" | "localized";
  languages: string[];
  createdAt: string;
  extension: string;
}): string {
  if (!uuid.test(input.gameId) || !uuid.test(input.versionId))
    throw new Error("Canonical UUIDs required.");
  if (
    !assetRoles.includes(input.role) ||
    !["official", "community"].includes(input.provenance)
  )
    throw new Error("Invalid asset classification.");
  if (!["png", "jpg", "ico", "mp4", "webm"].includes(input.extension))
    throw new Error("Unsupported storage extension.");
  if (input.extension === "ico" && input.role !== "client_icon")
    throw new Error("ICO requires the client_icon role.");
  if (["mp4", "webm"].includes(input.extension) !== (input.role === "trailer"))
    throw new Error("File extension and media role disagree.");
  const date = new Date(input.createdAt);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid creation time.");
  return `games/${input.gameId.toLowerCase()}/${input.provenance}/${input.role}/${languageScope(input.languageKind, input.languages)}/${date.toISOString().slice(0, 7).replace("-", "/")}/${input.versionId.toLowerCase()}/original.${input.extension}`;
}
export function creditOptions(
  role: AdminRole | null,
  registered: boolean,
): CreditKind[] {
  if (!registered) return [];
  return role === "super_admin"
    ? ["official", "platform", "personal"]
    : ["personal"];
}
export function selectVersion(
  versions: AssetVersion[],
  input: {
    gameId: string;
    role: AssetRole;
    language: string;
    context: string;
    asOf: string;
  },
): AssetVersion | null {
  const at = Date.parse(input.asOf);
  if (!Number.isFinite(at)) throw new Error("Invalid selection time.");
  const language = Intl.getCanonicalLocales(input.language)[0].toLowerCase();
  const eligible = versions.filter(
    (v) =>
      v.gameId === input.gameId &&
      v.role === input.role &&
      v.moderation === "approved" &&
      v.published &&
      v.rightsVerified &&
      Date.parse(v.createdAt) <= at &&
      (!v.validFrom || Date.parse(v.validFrom) <= at) &&
      (!v.validUntil || at < Date.parse(v.validUntil)) &&
      (v.context === input.context || v.context === "base") &&
      (v.languageKind === "global" ||
        v.languages.some((tag) => tag.toLowerCase() === language)),
  );
  eligible.sort(
    (a, b) =>
      Number(b.context === input.context) -
        Number(a.context === input.context) ||
      Number(b.languageKind === "localized") -
        Number(a.languageKind === "localized") ||
      Date.parse(b.validFrom ?? b.createdAt) -
        Date.parse(a.validFrom ?? a.createdAt) ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      a.id.localeCompare(b.id),
  );
  return eligible[0] ?? null;
}
