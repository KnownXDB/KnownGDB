import { Select } from "@knowngdb/ui/controls";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PageHeading } from "@knowngdb/ui/workspace";

type Credential = {
  id: string;
  name: string;
  scope: string;
  expiresAt: string | null;
  revokedAt: string | null;
};
const endpoint = "/api/v1/admin/integration-credentials";

export function IntegrationCredentials() {
  const [rows, setRows] = useState<Credential[]>([]);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [canCopy, setCanCopy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);

  async function refresh(signal: AbortSignal) {
    const response = await fetch(endpoint, { signal, cache: "no-store" });
    if (!response.ok) throw Error("Credential list unavailable.");
    const list: Credential[] = await response.json();
    if (!signal.aborted) setRows(list);
  }
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    refresh(controller.signal)
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage("Credential list unavailable. Reload to retry.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => {
      controller.abort();
      key.current = null;
    };
  }, []);

  function discard() {
    key.current = null;
    setCanCopy(false);
  }
  async function copy() {
    if (!key.current) return;
    try {
      await navigator.clipboard.writeText(key.current);
      discard();
      setMessage("Key copied. Store it in your integration’s secret manager.");
    } catch {
      setMessage("Copy failed. Allow clipboard access and try again.");
    }
  }
  async function save(event: FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault();
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const reason = String(fields.get("reason")).trim();
    setBusy(true);
    setMessage("");
    try {
      const body = id
        ? { id, reason }
        : {
            name: String(fields.get("name")).trim(),
            scopes: fields.getAll("scopes"),
            expiresAt:
              fields.get("days") === "never"
                ? null
                : new Date(
                    Date.now() + Number(fields.get("days")) * 86_400_000,
                  ).toISOString(),
            reason,
          };
      const response = await fetch(endpoint, {
        method: id ? "DELETE" : "POST",
        signal,
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setMessage(
          response.status === 400
            ? "Check the name, reason and expiration. Expiration must be within one year."
            : "Credential operation failed. Refresh the list before retrying.",
        );
        return;
      }
      const result = await response.json();
      if (signal.aborted) return;
      if (!id) {
        key.current = result.key;
        setCanCopy(true);
      }
      form.reset();
      setRevoking(null);
      setMessage(
        id
          ? "Credential revoked."
          : "Credential created. Copy the key before leaving this page.",
      );
      try {
        await refresh(signal);
      } catch {
        if (!signal.aborted)
          setMessage("Operation completed. The list could not be refreshed.");
      }
    } catch {
      if (!signal.aborted)
        setMessage(
          "Unable to confirm the result. Reload the list before retrying.",
        );
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title="Integration credentials" />
      <section className="surface narrow">
        <h2>Create a credential</h2>
        <form onSubmit={(e) => void save(e)}>
          <fieldset disabled={busy || canCopy}>
            <label>
              Name
              <input name="name" required maxLength={80} />
            </label>
            <fieldset>
              <legend>Permissions</legend>
              <label>
                <input
                  type="checkbox"
                  name="scopes"
                  value="identity:resolve"
                  defaultChecked
                />{" "}
                Resolve identities and preview intake
              </label>
              <label>
                <input type="checkbox" name="scopes" value="intake:text" />{" "}
                Stage text transfers
              </label>
            </fieldset>
            <label>
              Expiration
              <Select name="days" aria-label="Expiration" defaultValue="never">
                <option value="never">Never expires</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
              </Select>
            </label>
            <label>
              Creation reason
              <input name="reason" required maxLength={2000} />
            </label>
            <button>Create credential</button>
          </fieldset>
        </form>
        <p role="status">{message}</p>
        {canCopy && (
          <div>
            <button type="button" onClick={() => void copy()}>
              Copy key
            </button>{" "}
            <button type="button" onClick={discard}>
              Discard key
            </button>
          </div>
        )}
      </section>
      <section className="surface">
        <h2>Issued credentials</h2>
        {rows.length === 0 && !busy && !message && (
          <p>No credentials issued.</p>
        )}
        {rows.map((row) => (
          <article key={row.id}>
            <h3>{row.name}</h3>
            <p>
              {row.scope.split("+").join(", ")} ·{" "}
              {row.expiresAt
                ? `Expires ${new Date(row.expiresAt).toLocaleString()}`
                : "Never expires"}
            </p>
            {row.revokedAt ? (
              <p>Revoked</p>
            ) : row.expiresAt !== null &&
              Date.parse(row.expiresAt) <= Date.now() ? (
              <p>Expired</p>
            ) : revoking === row.id ? (
              <form onSubmit={(e) => void save(e, row.id)}>
                <label>
                  Revocation reason
                  <input name="reason" required maxLength={2000} />
                </label>
                <button disabled={busy}>Confirm revocation</button>{" "}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRevoking(null)}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                disabled={busy || canCopy}
                onClick={() => setRevoking(row.id)}
              >
                Revoke
              </button>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
