import { useEffect, useRef, useState } from "react";
import { AssetFile } from "@knowngdb/ui/asset-file";
import type {
  VersionSummary,
  VersionPage,
  GameMetadata,
  CatalogTerm,
} from "@knowngdb/contracts";
import { Gamepad2, Globe2, Layers3 } from "lucide-react";

export function PublishedVersions({
  gameId,
  title,
}: {
  gameId: string;
  title: string;
}) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const request = useRef<AbortController | null>(null);
  const visibleCount = useRef(0);
  useEffect(() => {
    visibleCount.current = versions.length;
  }, [versions]);
  async function load(after: string | null = null) {
    request.current?.abort();
    const current = new AbortController();
    request.current = current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/games/${encodeURIComponent(gameId)}/asset-versions${after ? `?cursor=${encodeURIComponent(after)}` : ""}`,
        { signal: current.signal },
      );
      const data: VersionPage & { error?: string } = await response.json();
      if (current.signal.aborted) return;
      if (!response.ok)
        throw Error(data.error || "Published versions are unavailable.");
      setVersions((old) =>
        after ? [...old, ...data.versions] : data.versions,
      );
      setCursor(data.nextCursor);
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
  async function refreshVisible() {
    if (document.visibilityState !== "visible" || request.current) return;
    const current = new AbortController();
    request.current = current;
    try {
      const refreshed: VersionSummary[] = [];
      let after: string | null = null;
      let pages = 0;
      do {
        const response = await fetch(
          `/api/v1/games/${encodeURIComponent(gameId)}/asset-versions${after ? `?cursor=${encodeURIComponent(after)}` : ""}`,
          { signal: current.signal },
        );
        if (!response.ok) throw Error("Published versions are unavailable.");
        const data: VersionPage = await response.json();
        refreshed.push(...data.versions);
        after = data.nextCursor;
        pages++;
      } while (after && refreshed.length < visibleCount.current && pages < 50);
      if (!current.signal.aborted) {
        setVersions(refreshed);
        setCursor(after);
        setError("");
      }
    } catch {
      if (!current.signal.aborted) {
        setVersions([]);
        setCursor(null);
        setError("Published versions are temporarily unavailable.");
      }
    } finally {
      if (request.current === current) request.current = null;
    }
  }
  useEffect(() => {
    setVersions([]);
    setCategory("all");
    setPlatforms([]);
    void load();
    const timer = window.setInterval(() => void refreshVisible(), 60_000);
    const refresh = () => void refreshVisible();
    document.addEventListener("visibilitychange", refresh);
    const controller = new AbortController();
    void fetch(`/api/v1/games/${encodeURIComponent(gameId)}/metadata`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 204) return null;
        return response.ok
          ? ((await response.json()) as {
              data: GameMetadata;
              terms: CatalogTerm[];
            })
          : null;
      })
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
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      request.current?.abort();
      controller.abort();
    };
  }, [gameId]);
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
      ? versions
      : versions.filter((version) => group.roles.includes(version.role))
  )
    .slice()
    .sort((a, b) => (rank[a.role] ?? 6) - (rank[b.role] ?? 6));
  const hero =
    versions.find(
      (version) => version.role === "hero" && version.storageVerified,
    ) ??
    versions.find(
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
            src="/api/v1/catalog/featured-artwork"
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
          {error || (busy ? "Updating…" : `${versions.length} loaded`)}
        </span>
      </div>
      <nav className="artwork-filters" aria-label="Artwork type">
        {groups
          .filter(
            (item) =>
              item.id === "all" ||
              versions.some((version) => item.roles.includes(version.role)),
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
      {!busy && !error && !versions.length && (
        <p>No published artwork is available yet.</p>
      )}
      <ul className="artwork-gallery">
        {visible.map((version) => (
          <li key={version.id} className="artwork-gallery-item">
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
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          className="artwork-load-more"
          disabled={busy}
          onClick={() => void load(cursor)}
        >
          Load more published versions
        </button>
      )}
    </section>
  );
}
