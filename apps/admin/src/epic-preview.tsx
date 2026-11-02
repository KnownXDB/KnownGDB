import { useState, type FormEvent } from "react";
import type { AdminRole, EpicStorePreview } from "@knowngdb/contracts";

export function EpicPreview({ role }: { role: AdminRole }) {
  const [preview, setPreview] = useState<EpicStorePreview | null>(null);
  const [requestValues, setRequestValues] = useState<{
    slug: string;
    locale: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const slug = String(data.get("slug") ?? "").trim();
    const locale = String(data.get("locale") ?? "en-US").trim();
    setBusy(true);
    setMessage("");
    setPreview(null);
    try {
      const response = await fetch("/api/v1/admin/store/epic/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, locale }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Epic preview failed.");
      setPreview(body.preview as EpicStorePreview);
      setRequestValues({ slug, locale });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Epic preview failed.",
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
      const response = await fetch("/api/v1/admin/store/epic/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestValues, gameId, reason }),
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error || "Epic observation could not be persisted.");
      setMessage(
        `Epic slug ${requestValues.slug} persisted as a verified official identity.`,
      );
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Epic observation could not be persisted.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="epic-preview-heading">
      <h2 id="epic-preview-heading">Official Epic Games Store observation</h2>
      <p>
        Preview an official Epic Games Store product home page by its URL slug.
        Namespace, catalog item and offer identifiers are kept as separate
        identities when the official page exposes them.
      </p>
      <form
        className="steam-preview-form"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          <span>Epic Store slug</span>
          <input
            name="slug"
            inputMode="text"
            pattern="[A-Za-z0-9][A-Za-z0-9-]{0,119}"
            maxLength={120}
            required
          />
        </label>
        <label>
          <span>Locale</span>
          <input
            name="locale"
            defaultValue="en-US"
            pattern="[a-z]{2,3}-[A-Z]{2}"
            required
          />
        </label>
        <button disabled={busy}>
          {busy ? "Reading official page…" : "Preview Epic page"}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {preview ? (
        <article className="steam-preview-card">
          <h3>{preview.title || "Untitled Epic product"}</h3>
          <dl className="version-metadata">
            <div>
              <dt>Slug</dt>
              <dd>{preview.slug}</dd>
            </div>
            <div>
              <dt>Locale</dt>
              <dd>{preview.locale}</dd>
            </div>
            <div>
              <dt>Parsed identities</dt>
              <dd>{preview.identities.length}</dd>
            </div>
            <div>
              <dt>Release date</dt>
              <dd>{preview.releaseDate || "Unknown"}</dd>
            </div>
          </dl>
          {preview.description ? <p>{preview.description}</p> : null}
          {preview.identities.length > 1 ? (
            <ul>
              {preview.identities.slice(1).map((identity) => (
                <li key={`${identity.kind}:${identity.value}`}>
                  {identity.kind}: {identity.value}
                </li>
              ))}
            </ul>
          ) : null}
          <p>
            <a href={preview.url} target="_blank" rel="noreferrer">
              Open official Epic Games Store page
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
