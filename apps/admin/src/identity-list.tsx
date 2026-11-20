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
