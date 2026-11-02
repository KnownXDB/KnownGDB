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
          <select
            value={expiration}
            onChange={(event) => setExpiration(event.target.value)}
            disabled={busy}
          >
            <option value="never">Never expires</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
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
      <ul>
        {keys.map((key) => (
          <li key={key.id}>
            {key.name} · {key.prefix}… ·{" "}
            {key.expiresAt
              ? `expires ${new Date(key.expiresAt).toLocaleDateString()}`
              : "Never expires"}{" "}
            {!key.revokedAt && key.expiresAt && (
              <button
                disabled={busy}
                onClick={() => void removeExpiration(key.id)}
              >
                Remove expiration
              </button>
            )}
            {key.revokedAt ? (
              "Revoked"
            ) : (
              <button disabled={busy} onClick={() => void revoke(key.id)}>
                Revoke
              </button>
            )}
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
