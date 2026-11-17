import {
  Pencil,
  Trash2,
  Ban,
  Infinity as InfinityIcon,
  Check,
  X,
} from "lucide-react";
import { confirmAction } from "./feedback";
import { Select } from "./controls";
import { useEffect, useState, type FormEvent } from "react";

type Key = {
  id: string;
  name: string;
  prefix: string;
  expiresAt: string | null;
  revokedAt: string | null;
};
export function ApiKeys() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [expiration, setExpiration] = useState("never");
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  async function call(method = "GET", body?: unknown) {
    const response = await fetch("/api/v1/account/api-keys", {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Key operation failed.");
    return data;
  }
  useEffect(() => {
    let active = true;
    call()
      .then((data) => {
        if (active) setKeys(data.keys);
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = new FormData(form).get("name");
    setBusy(true);
    setSecret("");
    setMessage("");
    try {
      const expiresAt =
        expiration === "never"
          ? null
          : new Date(Date.now() + Number(expiration) * 86400000).toISOString();
      const data = await call("POST", { name, expiresAt });
      setSecret(data.key);
      form.reset();
      setKeys((await call()).keys);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create key.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setMessage("");
    setSecret("");
    try {
      await call("DELETE", { id });
      setKeys((await call()).keys);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to revoke key.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function rename(event: FormEvent<HTMLFormElement>, key: Key) {
    event.preventDefault();
    if (busy) return;
    const name = draftName.trim();
    if (!name || name.length > 80 || /[\p{Cc}\p{Cf}<>]/u.test(name)) {
      setMessage(
        "Enter a name of 1 to 80 characters without control characters or angle brackets.",
      );
      return;
    }
    if (name === key.name) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await call("PATCH", { id: key.id, name });
      if (!result.updated)
        throw Error("The key could not be renamed. Refresh and try again.");
      setKeys((old) =>
        old.map((item) => (item.id === key.id ? { ...item, name } : item)),
      );
      setEditing(null);
      setMessage("API key renamed.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to rename key.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeKey(key: Key) {
    if (busy) return;
    const confirmed = await confirmAction(
      key.revokedAt
        ? `Delete “${key.name}” permanently?`
        : `Delete “${key.name}” permanently? Services using this key will lose access.`,
      {
        title: "Delete API key?",
        confirmLabel: "Delete key",
        cancelLabel: "Cancel",
      },
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await call("DELETE", { id: key.id, permanent: true });
      if (!result.deleted)
        throw Error("The key could not be deleted. Refresh and try again.");
      setKeys((old) => old.filter((item) => item.id !== key.id));
      if (editing === key.id) setEditing(null);
      setMessage("API key deleted.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to delete key.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeExpiration(id: string) {
    setBusy(true);
    setMessage("");
    try {
      await call("PATCH", { id, expiresAt: null });
      setKeys((await call()).keys);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update expiration.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="API keys">
      <h3>API keys</h3>
      <p>
        Create a key for server-side catalog reads. Choose an expiration or no
        expiration. Keep them private.
      </p>
      <form onSubmit={create}>
        <label>
          Key name
          <input name="name" required maxLength={80} />
        </label>
        <label>
          Expiration
          <Select
            value={expiration}
            onChange={(event) => setExpiration(event.target.value)}
            disabled={busy}
          >
            <option value="never">Never expires</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </Select>
        </label>
        <button disabled={busy}>Create API key</button>
      </form>
      {secret && (
        <div>
          <p>Copy this key now. It is shown only once.</p>
          <label>
            New API key
            <input readOnly value={secret} autoComplete="off" />
          </label>
          <button onClick={() => setSecret("")}>Dismiss key</button>
        </div>
      )}
      <ul className="api-key-list">
        {keys.map((key) => (
          <li key={key.id} className="api-key-row">
            <div className="api-key-content">
              {editing === key.id ? (
                <form
                  className="api-key-rename"
                  onSubmit={(event) => void rename(event, key)}
                >
                  <label className="sr-only" htmlFor={`key-name-${key.id}`}>
                    Key name
                  </label>
                  <input
                    id={`key-name-${key.id}`}
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    required
                    maxLength={80}
                    autoFocus
                    disabled={busy}
                  />
                  <button
                    className="icon-button"
                    type="submit"
                    aria-label="Save key name"
                    title="Save key name"
                    disabled={busy}
                  >
                    <Check size={18} aria-hidden="true" />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Cancel renaming"
                    title="Cancel renaming"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <strong>{key.name}</strong>
              )}
              <span className="api-key-meta">
                {key.prefix}… ·{" "}
                {key.expiresAt
                  ? `Expires ${new Date(key.expiresAt).toLocaleDateString()}`
                  : "Never expires"}
                {key.revokedAt ? " · Revoked" : ""}
              </span>
            </div>
            <div className="api-key-actions">
              {editing !== key.id && (
                <button
                  className="icon-button"
                  type="button"
                  disabled={busy}
                  aria-label={`Rename ${key.name}`}
                  title="Rename key"
                  onClick={() => {
                    setDraftName(key.name);
                    setEditing(key.id);
                    setMessage("");
                  }}
                >
                  <Pencil size={18} aria-hidden="true" />
                </button>
              )}
              {!key.revokedAt && key.expiresAt && (
                <button
                  className="icon-button"
                  type="button"
                  disabled={busy}
                  aria-label={`Remove expiration from ${key.name}`}
                  title="Remove expiration"
                  onClick={() => void removeExpiration(key.id)}
                >
                  <InfinityIcon size={18} aria-hidden="true" />
                </button>
              )}
              {!key.revokedAt && (
                <button
                  className="icon-button"
                  type="button"
                  disabled={busy}
                  aria-label={`Revoke ${key.name}`}
                  title="Revoke key"
                  onClick={() => void revoke(key.id)}
                >
                  <Ban size={18} aria-hidden="true" />
                </button>
              )}
              <button
                className="icon-button is-danger"
                type="button"
                disabled={busy}
                aria-label={`Delete ${key.name}`}
                title="Delete key"
                onClick={() => void removeKey(key)}
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p role="status">{busy ? "Working…" : message}</p>
      <p>
        <a href="/developers">API documentation and playground ↗</a>
      </p>
    </section>
  );
}
