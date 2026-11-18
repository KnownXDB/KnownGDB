import { memo, useEffect, useRef, useState } from "react";
import { AssetFile } from "@knowngdb/ui/asset-file";
import type {
  VersionSummary,
  VersionPage,
  GameMetadata,
  CatalogTerm,
} from "@knowngdb/contracts";
import { Gamepad2, Globe2, Layers3 } from "lucide-react";
import { VirtualizedCollection } from "@knowngdb/ui/virtualized-collection";
import {
  fetchCatalog,
  fetchPublicMetadata,
  readCatalogCache,
  versionPageKey,
} from "./catalog/data";

export const PublishedVersions = memo(function PublishedVersions({
  gameId,
  title,
}: {
  gameId: string;
  title: string;
}) {
  const [versions, setVersions] = useState<VersionSummary[]>(
    () => readCatalogCache<VersionPage>(versionPageKey(gameId))?.versions ?? [],
  );
  const [versionsGameId, setVersionsGameId] = useState(gameId);
  const [cursor, setCursor] = useState<string | null>(
    () =>
      readCatalogCache<VersionPage>(versionPageKey(gameId))?.nextCursor ?? null,
  );
  const [cursorGameId, setCursorGameId] = useState(gameId);
  const [busy, setBusy] = useState(
    () => !readCatalogCache(versionPageKey(gameId)),
  );
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const request = useRef<AbortController | null>(null);
  async function load(after: string | null = null) {
    request.current?.abort();
    const current = new AbortController();
    request.current = current;
    if (after || versionsGameId !== gameId || versions.length === 0)
      setBusy(true);
    setError("");
    try {
      const data = await fetchCatalog<VersionPage>(
        versionPageKey(gameId, after),
        current.signal,
      );
      if (current.signal.aborted) return;
      setVersions((old) =>
        after ? [...old, ...data.versions] : data.versions,
      );
      setVersionsGameId(gameId);
      setCursor(data.nextCursor);
      setCursorGameId(gameId);
    } catch (error) {
      if (!current.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "Published versions are unavailable.",
        );
    } finally {
      if (!current.signal.aborted) setBusy(false);
      if (request.current === current) request.current = null;
    }
  }
  useEffect(() => {
    const cached = readCatalogCache<VersionPage>(versionPageKey(gameId));
    setVersions(cached?.versions ?? []);
    setVersionsGameId(gameId);
    setCursor(cached?.nextCursor ?? null);
    setCursorGameId(gameId);
    setCategory("all");
    setPlatforms([]);
    void load();
    const controller = new AbortController();
    void fetchPublicMetadata<{
      data: GameMetadata;
      terms: CatalogTerm[];
    }>(`/api/v1/games/${encodeURIComponent(gameId)}/metadata`)
      .then((result) => {
        if (!result || controller.signal.aborted) return;
        const names = new Map(
          result.terms
            .filter((term) => term.kind === "platform")
            .map((term) => [term.id, term.name]),
        );
        setPlatforms([
          ...new Set(
            result.data.releases
              .map((release) => names.get(release.platformId))
              .filter((name): name is string => Boolean(name)),
          ),
        ]);
      })
      .catch(() => {});
    return () => {
      request.current?.abort();
      controller.abort();
    };
  }, [gameId]);
  const displayedVersions =
    versionsGameId === gameId
      ? versions
      : (readCatalogCache<VersionPage>(versionPageKey(gameId))?.versions ?? []);
  const displayedCursor =
    cursorGameId === gameId
      ? cursor
      : (readCatalogCache<VersionPage>(versionPageKey(gameId))?.nextCursor ??
        null);
  const groups = [
    { id: "all", label: "All artwork", roles: [] },
    { id: "capsule", label: "Capsules", roles: ["capsule"] },
    { id: "hero", label: "Heroes", roles: ["hero", "header"] },
    { id: "logo", label: "Logos", roles: ["logo"] },
    { id: "icon", label: "Icons", roles: ["icon", "client_icon"] },
    {
      id: "other",
      label: "More",
      roles: ["store_image", "in_game_image", "promotional_artwork", "trailer"],
    },
  ];
  const group = groups.find((item) => item.id === category)!;
  const rank: Record<string, number> = {
    capsule: 0,
    hero: 1,
    header: 2,
    logo: 3,
    icon: 4,
    client_icon: 5,
  };
  const visible = (
    category === "all"
      ? displayedVersions
      : displayedVersions.filter((version) =>
          group.roles.includes(version.role),
        )
  )
    .slice()
    .sort((a, b) => (rank[a.role] ?? 6) - (rank[b.role] ?? 6));
  const hero =
    displayedVersions.find(
      (version) => version.role === "hero" && version.storageVerified,
    ) ??
    displayedVersions.find(
      (version) => version.role === "header" && version.storageVerified,
    );
  return (
    <section
      className="game-gallery"
      aria-label={`Published versions for ${title}`}
    >
      <div className="game-gallery-hero">
        {hero && (
          <img
            src={`/api/v1/asset-versions/${hero.id}/display`}
            alt=""
            loading="eager"
            fetchPriority="high"
          />
        )}
        <div className="game-gallery-hero-content">
          <p className="game-gallery-eyebrow">
            <Layers3 size={15} aria-hidden="true" /> Artwork collection
          </p>
          <p>Explore published artwork for this game.</p>
          {platforms.length > 0 && (
            <div className="game-platforms" aria-label="Game platforms">
              <Gamepad2 size={15} aria-hidden="true" />
              {platforms.map((platform) => (
                <span key={platform}>{platform}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="game-gallery-toolbar">
        <div>
          <h2>Artwork</h2>
          <p>Browse by asset type</p>
        </div>
        <span role="status">
          {error ||
            (busy && !displayedVersions.length
              ? "Loading artwork…"
              : `${displayedVersions.length} loaded`)}
        </span>
      </div>
      <nav className="artwork-filters" aria-label="Artwork type">
        {groups
          .filter(
            (item) =>
              item.id === "all" ||
              displayedVersions.some((version) =>
                item.roles.includes(version.role),
              ),
          )
          .map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
      </nav>
      {!busy && !error && !displayedVersions.length && (
        <p>No published artwork is available yet.</p>
      )}
      <VirtualizedCollection
        items={visible}
        getKey={(version) => version.id}
        label={`Published artwork for ${title}`}
        className="artwork-gallery"
        layout="grid"
        minItemWidthToken="--sys-layout-artwork-card-min"
        mobileMinItemWidthToken="--sys-layout-artwork-card-min"
        estimateRowSizeToken="--sys-virtual-artwork-row-estimate"
        gapToken="--sys-virtual-artwork-gap"
        renderItem={(version) => (
          <article className="artwork-gallery-item">
            <AssetFile
              versionId={version.id}
              label={version.role.replaceAll("_", " ")}
              available={version.storageVerified && version.role !== "trailer"}
              initialPreview
              fixedPreview
              previewVariant="thumbnail"
            />
            <div className="artwork-card-content">
              <div className="artwork-card-title">
                <strong>{version.role.replaceAll("_", " ")}</strong>
                <span>Revision {version.revision}</span>
              </div>
              <div className="artwork-tags">
                <span>
                  <Globe2 size={13} aria-hidden="true" />
                  {version.languageKind === "global"
                    ? "Global"
                    : version.languages.join(", ")}
                </span>
              </div>
              <div className="artwork-author">
                <span className="artwork-avatar" aria-hidden="true">
                  {version.credit.label.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <span>{version.credit.label}</span>
                <time dateTime={version.createdAt}>
                  {new Date(version.createdAt).toLocaleDateString()}
                </time>
              </div>
            </div>
          </article>
        )}
      />
      {displayedCursor && (
        <button
          className="artwork-load-more"
          disabled={busy}
          onClick={() => void load(displayedCursor)}
        >
          Load more published versions
        </button>
      )}
    </section>
  );
});
