import { useEffect, useRef, useState } from "react";
import { AssetFile } from "@knowngdb/ui/asset-file";
import type { VersionSummary, VersionPage } from "@knowngdb/contracts";

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
  const request = useRef<AbortController | null>(null);
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
    }
  }
  useEffect(() => {
    setVersions([]);
    void load();
    return () => request.current?.abort();
  }, [gameId]);
  return (
    <section aria-label={`Published versions for ${title}`}>
      <h3>Published asset versions</h3>
      <p role="status">{busy ? "Loading published versions…" : error}</p>
      {!busy && !error && !versions.length ? (
        <p>No published versions are available yet.</p>
      ) : null}
      <ul>
        {versions.map((version) => (
          <li key={version.id}>
            <strong>{version.role.replaceAll("_", " ")}</strong> · Revision{" "}
            {version.revision}
            <br />
            <small>
              {version.credit.label} ·{" "}
              {version.languageKind === "global"
                ? "Global"
                : version.languages.join(", ")}{" "}
              ·{" "}
              <time dateTime={version.createdAt}>
                {new Date(version.createdAt).toLocaleDateString()}
              </time>
            </small>
            <AssetFile
              versionId={version.id}
              label={version.role.replaceAll("_", " ")}
              available={version.storageVerified && version.role !== "trailer"}
            />
          </li>
        ))}
      </ul>
      {cursor ? (
        <button disabled={busy} onClick={() => void load(cursor)}>
          Load more published versions
        </button>
      ) : null}
    </section>
  );
}
