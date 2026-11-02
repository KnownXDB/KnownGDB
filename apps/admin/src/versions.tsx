import { useEffect, useRef, useState, type FormEvent } from "react";
import { AssetFile } from "@knowngdb/ui/asset-file";
import type {
  AdminRole,
  VersionPage,
  VersionSummary,
} from "@knowngdb/contracts";

export function VersionAdministration({ role }: { role: AdminRole }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gameNames, setGameNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/v1/admin/games", { signal: c.signal })
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        if (!c.signal.aborted)
          setGameNames(
            Object.fromEntries(
              d.games.map((g: { id: string; title: string }) => [
                g.id,
                g.title,
              ]),
            ),
          );
      })
      .catch(() => {});
    return () => c.abort();
  }, []);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  async function load(after: string | null = null) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/admin/asset-versions${after ? `?cursor=${encodeURIComponent(after)}` : ""}`,
        { signal: request.signal },
      );
      const data = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setVersions([]);
          window.dispatchEvent(new Event("knowngdb-session-changed"));
        }
        throw Error(data.error || "Version history is unavailable.");
      }
      const page: VersionPage = data;
      setVersions((old) =>
        after ? [...old, ...page.versions] : page.versions,
      );
      setCursor(page.nextCursor);
    } catch (error) {
      if (!request.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "Version history is unavailable.",
        );
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [role]);
  async function changePublication(
    event: FormEvent<HTMLFormElement>,
    version: VersionSummary,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const reason = String(new FormData(form).get("reason") ?? "").trim();
    if (!reason || pending) return;
    setPending(version.id);
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/admin/asset-versions/${version.id}/publication`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedStatus: version.published ? "published" : "private",
            publicationStatus: version.published ? "private" : "published",
            reason,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          window.dispatchEvent(new Event("knowngdb-session-changed"));
        throw Error(
          data.error ||
            "Publication could not be confirmed. Reload before retrying.",
        );
      }
      setVersions((old) =>
        old.map((item) =>
          item.id === version.id
            ? {
                ...item,
                published: data.publicationStatus === "published",
                changeReason: reason,
              }
            : item,
        ),
      );
      form.reset();
      setMessage(
        data.publicationStatus === "published"
          ? "Version published. Original files and earlier history are preserved."
          : "Version is private. Original files and earlier history are preserved.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Publication could not be confirmed. Reload before retrying.",
      );
    } finally {
      setPending(null);
    }
  }
  async function reviewVersion(
    event: FormEvent<HTMLFormElement>,
    version: VersionSummary,
  ) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const reason = String(new FormData(form).get("reason") ?? "").trim();
    const status = (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
      "value",
    );
    if (!reason || !status) return;
    setPending(version.id);
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/admin/asset-versions/${version.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedStatus: version.moderation,
            status,
            reason,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw Error(
          data.error ||
            "Review could not be confirmed. Refresh before retrying.",
        );
      await load();
      setMessage(
        "Review saved. Publication remains a separate Super Admin action.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review failed.");
    } finally {
      setPending(null);
    }
  }
  return (
    <section aria-labelledby="version-history-heading">
      <div className="version-toolbar">
        <h2 id="version-history-heading">Asset version history</h2>
        <button
          onClick={() => void load()}
          disabled={loading || Boolean(pending)}
        >
          Refresh history
        </button>
      </div>
      <p>
        Publication requires an approved version, verified storage and a
        published game. Every change records your identity and reason.
      </p>
      {role !== "super_admin" ? (
        <p>
          History is available for review. Publication requires Super Admin
          permission.
        </p>
      ) : null}
      <p role="status" aria-live="polite">
        {loading ? "Loading version history…" : message}
      </p>
      {!loading && !versions.length ? <p>No versions to display.</p> : null}
      <div className="moderation-workspace">
        <nav className="moderation-queue" aria-label="Asset queue">
          {versions.map((v) => (
            <button
              type="button"
              key={v.id}
              aria-current={selectedId === v.id ? "true" : undefined}
              onClick={() => setSelectedId(v.id)}
            >
              <strong>{gameNames[v.gameId] ?? "Catalog game"}</strong>
              <span>
                {v.role.replaceAll("_", " ")} · Revision {v.revision} ·{" "}
                {v.moderation} · {v.published ? "Published" : "Private"}
              </span>
            </button>
          ))}
        </nav>
        <div>
          {!selectedId ? (
            <div className="empty-state">
              <h3>Select an asset</h3>
              <p>
                Choose a version from the queue to inspect its original and
                review its publication requirements.
              </p>
            </div>
          ) : null}
          <ul className="version-list">
            {versions.map((version) => (
              <li key={version.id} hidden={selectedId !== version.id}>
                <article aria-labelledby={`version-${version.id}`}>
                  <h3 id={`version-${version.id}`}>
                    {gameNames[version.gameId] ?? "Catalog game"} ·{" "}
                    {version.role.replaceAll("_", " ")} · Revision{" "}
                    {version.revision}
                  </h3>
                  <span
                    className={`version-status ${version.published ? "is-published" : ""}`}
                  >
                    {version.published ? "Published" : "Private"}
                  </span>
                  <dl className="version-metadata">
                    <div>
                      <dt>Credit</dt>
                      <dd>{version.credit.label}</dd>
                    </div>
                    <div>
                      <dt>Languages</dt>
                      <dd>
                        {version.languageKind === "global"
                          ? "Global"
                          : version.languages.join(", ")}
                      </dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>
                        <time dateTime={version.createdAt}>
                          {new Date(version.createdAt).toLocaleString()}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt>Review</dt>
                      <dd>{version.moderation}</dd>
                    </div>
                    <div>
                      <dt>Storage</dt>
                      <dd>
                        {version.storageVerified ? "Verified" : "Unverified"}
                      </dd>
                    </div>
                    <div>
                      <dt>Context</dt>
                      <dd>{version.context}</dd>
                    </div>
                  </dl>
                  <AssetFile
                    versionId={version.id}
                    label={version.role.replaceAll("_", " ")}
                    admin
                    available={
                      version.storageVerified && version.role !== "trailer"
                    }
                  />
                  {version.changeReason ? (
                    <p className="version-reason">
                      Last recorded reason: {version.changeReason}
                    </p>
                  ) : null}
                  {!version.published &&
                  ["submitted", "in_review"].includes(version.moderation) ? (
                    <form
                      className="publication-form"
                      onSubmit={(event) => void reviewVersion(event, version)}
                    >
                      <label>
                        Review reason
                        <textarea
                          name="reason"
                          required
                          maxLength={2000}
                          disabled={Boolean(pending)}
                        />
                      </label>
                      {version.moderation === "submitted" ? (
                        <button
                          value="in_review"
                          disabled={Boolean(pending) || loading}
                        >
                          Start review
                        </button>
                      ) : (
                        <>
                          <button
                            value="approved"
                            disabled={
                              Boolean(pending) ||
                              loading ||
                              !version.storageVerified
                            }
                          >
                            Approve version
                          </button>
                          <button
                            value="rejected"
                            disabled={Boolean(pending) || loading}
                          >
                            Reject version
                          </button>
                        </>
                      )}
                    </form>
                  ) : null}
                  {role === "super_admin" &&
                  (version.published || version.canPublish) ? (
                    <form
                      className="publication-form"
                      onSubmit={(event) =>
                        void changePublication(event, version)
                      }
                    >
                      <label htmlFor={`reason-${version.id}`}>
                        Reason for{" "}
                        {version.published ? "making private" : "publication"}
                        <textarea
                          id={`reason-${version.id}`}
                          name="reason"
                          required
                          maxLength={2000}
                          rows={2}
                          disabled={Boolean(pending)}
                        />
                      </label>
                      <button disabled={Boolean(pending) || loading}>
                        {pending === version.id
                          ? "Saving…"
                          : version.published
                            ? "Make private"
                            : "Publish version"}
                      </button>
                    </form>
                  ) : role === "super_admin" ? (
                    <div>
                      <p>Publication blocked:</p>
                      <ul>
                        {(version.publicationBlockers?.length
                          ? version.publicationBlockers
                          : [
                              "Refresh history to check publication requirements.",
                            ]
                        ).map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      <a href={`#/games/${version.gameId}/visibility`}>
                        Manage games
                      </a>
                    </div>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {cursor ? (
        <button
          onClick={() => void load(cursor)}
          disabled={loading || Boolean(pending)}
        >
          Load more versions
        </button>
      ) : null}
    </section>
  );
}
