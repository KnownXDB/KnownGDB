import { useState, type FormEvent } from "react";
import type { AdminRole, PlayStationStorePreview } from "@knowngdb/contracts";

export function PlayStationPreview({ role }: { role: AdminRole }) {
  const [preview, setPreview] = useState<PlayStationStorePreview | null>(null);
  const [requestValues, setRequestValues] = useState<{
    pageKind: "concept" | "product";
    identifier: string;
    locale: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const pageKind = data.get("pageKind") === "product" ? "product" : "concept";
    const identifier = String(data.get("identifier") ?? "").trim();
    const locale = String(data.get("locale") ?? "en-us").trim();
    setBusy(true);
    setMessage("");
    setPreview(null);
    try {
      const response = await fetch("/api/v1/admin/store/playstation/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageKind, identifier, locale }),
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error || "PlayStation preview failed.");
      setPreview(body.preview as PlayStationStorePreview);
      setRequestValues({ pageKind, identifier, locale });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "PlayStation preview failed.",
      );
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
      const response = await fetch("/api/v1/admin/store/playstation/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestValues, gameId, reason }),
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(
          body.error || "PlayStation observation could not be persisted.",
        );
      setMessage(
        `PlayStation ${requestValues.pageKind} ID ${requestValues.identifier} persisted as a verified official identity.`,
      );
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "PlayStation observation could not be persisted.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="playstation-preview-heading">
      <h2 id="playstation-preview-heading">
        Official PlayStation Store observation
      </h2>
      <p>
        Preview a PlayStation Store concept or product page. A concept groups
        related editions, while a product ID identifies one regional product;
        they are persisted as different identity namespaces.
      </p>
      <form
        className="steam-preview-form"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          <span>Page kind</span>
          <select name="pageKind" defaultValue="concept">
            <option value="concept">Concept</option>
            <option value="product">Product</option>
          </select>
        </label>
        <label>
          <span>Concept or Product ID</span>
          <input name="identifier" inputMode="text" required />
        </label>
        <label>
          <span>Locale</span>
          <input
            name="locale"
            defaultValue="en-us"
            pattern="[a-z]{2}-[a-z]{2}"
            required
          />
        </label>
        <button disabled={busy}>
          {busy ? "Reading official page…" : "Preview PlayStation page"}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {preview ? (
        <article className="steam-preview-card">
          <h3>{preview.title || "Untitled PlayStation product"}</h3>
          <dl className="version-metadata">
            <div>
              <dt>Page kind</dt>
              <dd>{preview.pageKind}</dd>
            </div>
            <div>
              <dt>Identifier</dt>
              <dd>{preview.identifier}</dd>
            </div>
            <div>
              <dt>Locale</dt>
              <dd>{preview.locale}</dd>
            </div>
            <div>
              <dt>Release date</dt>
              <dd>{preview.releaseDate || "Unknown"}</dd>
            </div>
          </dl>
          {preview.description ? <p>{preview.description}</p> : null}
          <p>
            <a href={preview.url} target="_blank" rel="noreferrer">
              Open official PlayStation Store page
            </a>
          </p>
          <small>
            Observed {new Date(preview.fetchedAt).toLocaleString()} · Official
            page · Not persisted
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
                {busy ? "Persisting…" : "Confirm and persist identity"}
              </button>
            </form>
          ) : (
            <p>Super Admin permission is required to persist this identity.</p>
          )}
        </article>
      ) : null}
    </section>
  );
}
