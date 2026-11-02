import { useState, type FormEvent } from "react";
import type { AdminRole, SteamStorePreview } from "@knowngdb/contracts";

export function SteamPreview({ role }: { role: AdminRole }) {
  const [preview, setPreview] = useState<SteamStorePreview | null>(null);
  const [requestValues, setRequestValues] = useState<{
    appId: string;
    region: string;
    locale: string | null;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const appId = String(data.get("appId") ?? "").trim();
    const region = String(data.get("region") ?? "US").trim();
    const locale = String(data.get("locale") ?? "en").trim();
    setBusy(true);
    setMessage("");
    setPreview(null);
    try {
      const response = await fetch("/api/v1/admin/store/steam/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, region, locale }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Steam preview failed.");
      setPreview(body.preview as SteamStorePreview);
      setRequestValues({ appId, region, locale: locale || null });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Steam preview failed.",
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
      const response = await fetch("/api/v1/admin/store/steam/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestValues, gameId, reason }),
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error || "Steam observation could not be persisted.");
      setMessage(
        `Steam App ID ${requestValues.appId} persisted as a verified official identity.`,
      );
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Steam observation could not be persisted.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="steam-preview-heading">
      <h2 id="steam-preview-heading">Official Steam observation</h2>
      <p>
        Preview a Steam Store page by App ID. This reads official data only and
        does not create or publish a catalog record until a Super Admin confirms
        the reviewed observation below.
      </p>
      <form
        className="steam-preview-form"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          <span>Steam App ID</span>
          <input
            name="appId"
            inputMode="numeric"
            pattern="[1-9][0-9]{0,9}"
            required
          />
        </label>
        <label>
          <span>Region</span>
          <input
            name="region"
            defaultValue="US"
            pattern="[A-Z0-9]{2,8}"
            required
          />
        </label>
        <label>
          <span>Locale</span>
          <input
            name="locale"
            defaultValue="en"
            pattern="[a-z]{2,3}(-[A-Za-z0-9]{2,8})*"
          />
        </label>
        <button disabled={busy}>
          {busy ? "Reading official page…" : "Preview Steam page"}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {preview ? (
        <article className="steam-preview-card">
          <h3>{preview.title || "Untitled Steam product"}</h3>
          <dl className="version-metadata">
            <div>
              <dt>App ID</dt>
              <dd>{preview.appId}</dd>
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
          <p>
            <a href={preview.url} target="_blank" rel="noreferrer">
              Open official Steam page
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
