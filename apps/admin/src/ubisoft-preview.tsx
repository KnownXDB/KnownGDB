import { useState, type FormEvent } from "react";
import type { AdminRole, UbisoftStorePreview } from "@knowngdb/contracts";

export function UbisoftPreview({ role }: { role: AdminRole }) {
  const [preview, setPreview] = useState<UbisoftStorePreview | null>(null);
  const [requestValues, setRequestValues] = useState<{
    storeSlug: string;
    region: string;
    locale: string | null;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const storeSlug = String(data.get("storeSlug") ?? "").trim();
    const region = String(data.get("region") ?? "US").trim();
    const locale = String(data.get("locale") ?? "en_US").trim();
    setBusy(true);
    setMessage("");
    setPreview(null);
    try {
      const response = await fetch("/api/v1/admin/store/ubisoft/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeSlug, region, locale }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Ubisoft preview failed.");
      setPreview(body.preview as UbisoftStorePreview);
      setRequestValues({ storeSlug, region, locale: locale || null });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Ubisoft preview failed.",
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
      const response = await fetch("/api/v1/admin/store/ubisoft/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestValues, gameId, reason }),
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(
          body.error || "Ubisoft observation could not be persisted.",
        );
      setMessage(
        `Ubisoft slug ${requestValues.storeSlug} persisted as a verified official identity.`,
      );
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Ubisoft observation could not be persisted.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="ubisoft-preview-heading">
      <h2 id="ubisoft-preview-heading">Official Ubisoft Store observation</h2>
      <p>
        Preview an official Ubisoft Store product by slug, region and locale.
        Product ID and SKU are retained only when exposed by the official page;
        activation keys and account values are never treated as catalog IDs.
      </p>
      <form
        className="steam-preview-form"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          <span>Ubisoft Store slug</span>
          <input
            name="storeSlug"
            inputMode="text"
            pattern="[a-z0-9][a-z0-9-]{0,119}"
            maxLength={120}
            required
          />
        </label>
        <label>
          <span>Region</span>
          <input name="region" defaultValue="US" pattern="[A-Z]{2}" required />
        </label>
        <label>
          <span>Locale</span>
          <input
            name="locale"
            defaultValue="en_US"
            pattern="[a-z]{2,3}_[A-Z]{2}"
          />
        </label>
        <button disabled={busy}>
          {busy ? "Reading official page…" : "Preview Ubisoft page"}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {preview ? (
        <article className="steam-preview-card">
          <h3>{preview.title || "Untitled Ubisoft product"}</h3>
          <dl className="version-metadata">
            <div>
              <dt>Store slug</dt>
              <dd>{preview.storeSlug}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{preview.region}</dd>
            </div>
            <div>
              <dt>Locale</dt>
              <dd>{preview.locale || "Global"}</dd>
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
              Open official Ubisoft Store page
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
