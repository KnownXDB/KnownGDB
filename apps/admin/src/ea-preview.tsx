import { useState, type FormEvent } from "react";
import type { AdminRole, EAStorePreview } from "@knowngdb/contracts";

export function EAPreview({ role }: { role: AdminRole }) {
  const [preview, setPreview] = useState<EAStorePreview | null>(null);
  const [requestValues, setRequestValues] = useState<{
    seriesSlug: string;
    gameSlug: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const seriesSlug = String(data.get("seriesSlug") ?? "").trim();
    const gameSlug = String(data.get("gameSlug") ?? "").trim();
    setBusy(true);
    setMessage("");
    setPreview(null);
    try {
      const response = await fetch("/api/v1/admin/store/ea/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesSlug, gameSlug }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "EA preview failed.");
      setPreview(body.preview as EAStorePreview);
      setRequestValues({ seriesSlug, gameSlug });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "EA preview failed.");
    } finally {
      setBusy(false);
    }
  }
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestValues || role !== "super_admin") return;
    const data = new FormData(event.currentTarget);
    const gameId = String(data.get("gameId") ?? "").trim();
    const reason = String(data.get("reason") ?? "").trim();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/admin/store/ea/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestValues, gameId, reason }),
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error || "EA observation could not be persisted.");
      setMessage(
        `EA game slug ${requestValues.gameSlug} persisted as a verified official identity.`,
      );
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "EA observation could not be persisted.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="ea-preview-heading">
      <h2 id="ea-preview-heading">Official EA game observation</h2>
      <p>
        Preview an official EA product page by its series and game slugs. EA
        product codes are transactional redemption values, not catalog IDs; they
        are not accepted here as game identity.
      </p>
      <form
        className="steam-preview-form"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          <span>EA series slug</span>
          <input
            name="seriesSlug"
            inputMode="text"
            pattern="[a-z0-9][a-z0-9-]{0,79}"
            maxLength={80}
            required
          />
        </label>
        <label>
          <span>EA game slug</span>
          <input
            name="gameSlug"
            inputMode="text"
            pattern="[a-z0-9][a-z0-9-]{0,79}"
            maxLength={80}
            required
          />
        </label>
        <button disabled={busy}>
          {busy ? "Reading official page…" : "Preview EA page"}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {preview ? (
        <article className="steam-preview-card">
          <h3>{preview.title || "Untitled EA product"}</h3>
          <dl className="version-metadata">
            <div>
              <dt>Series slug</dt>
              <dd>{preview.seriesSlug}</dd>
            </div>
            <div>
              <dt>Game slug</dt>
              <dd>{preview.gameSlug}</dd>
            </div>
            <div>
              <dt>Release date</dt>
              <dd>{preview.releaseDate || "Unknown"}</dd>
            </div>
          </dl>
          {preview.description ? <p>{preview.description}</p> : null}
          <p>
            <a href={preview.url} target="_blank" rel="noreferrer">
              Open official EA page
            </a>
          </p>
          <small>
            Observed {new Date(preview.fetchedAt).toLocaleString()} · Official
            publisher page · Not persisted
          </small>
          {role === "super_admin" ? (
            <form
              className="publication-form"
              onSubmit={(event) => void confirm(event)}
            >
              <label>
                <span>KnownGDB catalog item UUID</span>
                <input name="gameId" required pattern="[0-9a-fA-F-]{36}" />
              </label>
              <label>
                <span>Review reason</span>
                <textarea name="reason" required maxLength={2000} rows={3} />
              </label>
              <button disabled={busy}>
                {busy ? "Persisting…" : "Confirm and persist identities"}
              </button>
            </form>
          ) : (
            <p>
              Super Admin permission is required to persist these identities.
            </p>
          )}
        </article>
      ) : null}
    </section>
  );
}
