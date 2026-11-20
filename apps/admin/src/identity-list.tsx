import { useState } from "react";

type Identity = {
  id: string;
  provider: string;
  identifier_kind: string;
  value: string;
  namespace: string;
  scope: string;
  region: string;
  locale: string | null;
  evidence_status: string;
};
export function IdentityList() {
  const [gameId, setGameId] = useState("");
  const [items, setItems] = useState<Identity[]>([]);
  const [message, setMessage] = useState("");
  const [productId, setProductId] = useState("");
  const [source, setSource] = useState("");
  const [reason, setReason] = useState("");
  async function load(event: React.FormEvent) {
    event.preventDefault();
    setItems([]);
    setMessage("Loading identities…");
    try {
      const response = await fetch(
        `/api/v1/admin/games/${encodeURIComponent(gameId.trim())}/identities`,
      );
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Identity list unavailable.");
      setItems(body.identities);
      setMessage(
        body.truncated
          ? "Showing the first 100 identities."
          : `${body.identities.length} identities found.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Identity list unavailable.",
      );
    }
  }
  async function submitGog(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Saving identity…");
    try {
      const response = await fetch("/api/v1/admin/identities/gog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: gameId.trim(),
          productId: productId.trim(),
          source: source.trim(),
          reason: reason.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error || "Identity could not be saved.");
      setMessage(
        body.status === "existing"
          ? "Identity already exists; its current review state was preserved."
          : "Identity saved for review.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Identity could not be saved.",
      );
    }
  }
  return (
    <section aria-labelledby="identities-heading">
      <h2 id="identities-heading">Catalog item identities</h2>
      <p>
        Inspect the external identifiers associated with a canonical catalog
        item.
      </p>
      <form onSubmit={load} className="steam-preview-form">
        <label>
          <span>Catalog item UUID</span>
          <input
            required
            value={gameId}
            onChange={(event) => setGameId(event.target.value)}
          />
        </label>
        <button type="submit">Load identities</button>
      </form>
      <form onSubmit={submitGog} className="steam-preview-form">
        <h3>Record GOG Product ID</h3>
        <p>
          Uses the catalog item UUID above. The association remains in review
          and requires Super Admin access.
        </p>
        <label>
          <span>GOG Product ID</span>
          <input
            required
            pattern="[0-9]{1,20}"
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
          />
        </label>
        <label>
          <span>Evidence URL</span>
          <input
            required
            type="url"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
        </label>
        <label>
          <span>Reason</span>
          <input
            required
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <button type="submit" disabled={!gameId.trim()}>
          Save for review
        </button>
      </form>
      <p role="status">{message}</p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.provider}</strong> — {item.identifier_kind}:{" "}
            {item.value} ({item.namespace}; {item.scope}; {item.region}
            {item.locale ? ` / ${item.locale}` : ""}; {item.evidence_status})
          </li>
        ))}
      </ul>
    </section>
  );
}
