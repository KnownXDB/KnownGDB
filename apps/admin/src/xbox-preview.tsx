import { useState, type FormEvent } from "react";
import type { AdminRole, XboxStorePreview } from "@knowngdb/contracts";

export function XboxPreview({ role }: { role: AdminRole }) {
  const [preview, setPreview] = useState<XboxStorePreview | null>(null);
  const [requestValues, setRequestValues] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const storeId = String(data.get("storeId") ?? "")
      .trim()
      .toUpperCase();
    setBusy(true);
    setMessage("");
    setPreview(null);
    try {
      const response = await fetch("/api/v1/admin/store/xbox/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Xbox preview failed.");
      setPreview(body.preview as XboxStorePreview);
      setRequestValues(storeId);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Xbox preview failed.",
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
      const response = await fetch("/api/v1/admin/store/xbox/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: requestValues, gameId, reason }),
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error || "Xbox observation could not be persisted.");
      setMessage(
        `Xbox Store ID ${requestValues} persisted as a verified official identity.`,
      );
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Xbox observation could not be persisted.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="xbox-preview-heading">
      <h2 id="xbox-preview-heading">
        Official Microsoft Store / Xbox observation
      </h2>
      <p>
        Preview the official Microsoft Store product page by Store ID. Xbox
        Title ID and other Partner Center identifiers remain separate evidence
        and are not inferred from the Store ID.
      </p>
      <form
        className="steam-preview-form"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          <span>Microsoft Store ID</span>
          <input
            name="storeId"
            inputMode="text"
            pattern="[A-Z0-9]{12}"
            maxLength={12}
            required
          />
        </label>
        <button disabled={busy}>
          {busy ? "Reading official page…" : "Preview Microsoft Store page"}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {preview ? (
        <article className="steam-preview-card">
          <h3>{preview.title || "Untitled Microsoft Store product"}</h3>
          <dl className="version-metadata">
            <div>
              <dt>Store ID</dt>
              <dd>{preview.storeId}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>Xbox / Microsoft Store</dd>
            </div>
            <div>
              <dt>Release date</dt>
              <dd>{preview.releaseDate || "Unknown"}</dd>
            </div>
          </dl>
          {preview.description ? <p>{preview.description}</p> : null}
          <p>
            <a href={preview.url} target="_blank" rel="noreferrer">
              Open official Microsoft Store page
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
