import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  assetRoles,
  type AdminRole,
  type GameSummary,
} from "@knowngdb/contracts";

type Collection = {
  id: string;
  game_id: string;
  role: string;
  credit_kind: string;
  created_at: string;
};
export function AssetSubmission({
  role,
  onSubmitted,
}: {
  role?: AdminRole | null;
  onSubmitted?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [games, setGames] = useState<GameSummary[]>([]),
    [collections, setCollections] = useState<Collection[]>([]);
  const [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState(""),
    [collection, setCollection] = useState("");
  const pending = useRef<{ id: string; file: File } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const selected = collections.find((c) => c.id === collection);
  const [accountRevision, setAccountRevision] = useState(0);
  useEffect(() => {
    const changed = () => {
      controller.current?.abort();
      pending.current = null;
      setCollection("");
      setReady(false);
      setAccountRevision((value) => value + 1);
    };
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("knowngdb-account")
        : null;
    if (channel) channel.onmessage = changed;
    window.addEventListener("knowngdb-session-changed", changed);
    return () => {
      channel?.close();
      window.removeEventListener("knowngdb-session-changed", changed);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    setReady(false);
    setMessage("");
    controller.current = abort;
    Promise.all([
      fetch("/api/v1/games", { signal: abort.signal }).then((r) => {
        if (!r.ok) throw Error("Game selection is temporarily unavailable.");
        return r.json();
      }),
      fetch("/api/v1/submissions", { signal: abort.signal }).then(async (r) => {
        const d = await r.json();
        if (!r.ok)
          throw Error(
            d.error ||
              "Sign in and save your public profile before submitting.",
          );
        return d;
      }),
    ])
      .then(([catalog, own]) => {
        if (!abort.signal.aborted) {
          setGames(catalog.games ?? []);
          setCollections(own.collections ?? []);
          setReady(true);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setMessage(e.message);
      });
    return () => abort.abort();
  }, [open, accountRevision]);
  useEffect(() => () => controller.current?.abort(), []);
  async function send(file: File, id: string, signal: AbortSignal) {
    const extension = file.name.split(".").at(-1)?.toLowerCase();
    const response = await fetch(`/api/v1/submissions/${id}/original`, {
      method: "PUT",
      headers: {
        "Content-Type":
          extension === "png"
            ? "image/png"
            : extension === "ico"
              ? "image/x-icon"
              : "image/jpeg",
      },
      body: file,
      signal,
    });
    const data = await response.json();
    if (response.status === 409) pending.current = null;
    if (!response.ok)
      throw Error(data.error || "Upload failed. Retry the reserved original.");
    pending.current = null;
    setMessage(
      "Original received. The version remains private and requires review before publication.",
    );
    onSubmitted?.();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (pending.current) {
        await send(pending.current.file, pending.current.id, abort.signal);
        form.reset();
        setCollection("");
        return;
      }
      const file = data.get("original");
      if (!(file instanceof File) || !file.size)
        throw Error("Choose an original image.");
      const ext = file.name.split(".").at(-1)?.toLowerCase(),
        extension = ext === "jpeg" ? "jpg" : ext;
      if (
        !["png", "jpg", "ico"].includes(extension ?? "") ||
        file.size > 2 * 1024 * 1024
      )
        throw Error("Use a PNG, JPEG or client ICO no larger than 2 MiB.");
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        ),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const languages = String(data.get("languages") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const metadata = {
        game_id: selected?.game_id ?? String(data.get("game")),
        collection_id: selected?.id ?? null,
        role: selected?.role ?? String(data.get("role")),
        credit_kind: selected?.credit_kind ?? String(data.get("credit")),
        language_kind: languages.length ? "localized" : "global",
        language_tags: languages,
        context_key: String(data.get("context")),
        valid_from: data.get("from")
          ? new Date(String(data.get("from"))).toISOString()
          : null,
        valid_until: data.get("until")
          ? new Date(String(data.get("until"))).toISOString()
          : null,
        extension,
        checksum_sha256: digest,
        byte_size: file.size,
        source_reference: String(data.get("source")),
        rights_reference: String(data.get("rights")),
      };
      const response = await fetch("/api/v1/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
        signal: abort.signal,
      });
      const reserved = await response.json();
      if (!response.ok)
        throw Error(reserved.error || "Cannot reserve this submission.");
      pending.current = { id: reserved.id, file };
      await send(file, reserved.id, abort.signal);
      form.reset();
      setCollection("");
    } catch (e) {
      if (!abort.signal.aborted)
        setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Image submission">
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={busy}>
        {open ? "Close submission" : "Submit an image"}
      </button>
      {open ? (
        <>
          <h2>Submit an original image</h2>
          <p>
            Sign in and save a public contributor name first. PNG, JPEG and
            client ICO originals up to 2 MiB are supported. Submissions stay
            private until reviewed and explicitly published.
          </p>
          <p role="status">
            {message || (!ready ? "Loading submission options…" : "")}
          </p>
          {!ready && message ? (
            <button
              type="button"
              onClick={() => setAccountRevision((value) => value + 1)}
            >
              Retry submission options
            </button>
          ) : null}
          {pending.current ? (
            <p>
              The original is reserved. Retry with the same file without
              creating another version.
            </p>
          ) : null}
          <form className="submission-form" onSubmit={(e) => void submit(e)}>
            <fieldset disabled={busy || !ready || Boolean(pending.current)}>
              <label>
                Version history
                <select
                  aria-label="Version history"
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                >
                  <option value="">New asset</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {games.find((g) => g.id === c.game_id)?.title ??
                        "Catalog game"}{" "}
                      · {c.role.replaceAll("_", " ")} ·{" "}
                      {new Date(c.created_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </label>
              {!selected ? (
                <>
                  <label>
                    Game
                    <select aria-label="Game" name="game" required>
                      <option value="">Select a game</option>
                      {games
                        .filter(
                          (g, i, a) => a.findIndex((x) => x.id === g.id) === i,
                        )
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Asset type
                    <select aria-label="Asset type" name="role">
                      {assetRoles
                        .filter((r) => r !== "trailer")
                        .map((r) => (
                          <option key={r} value={r}>
                            {r.replaceAll("_", " ")}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Publication credit
                    <select aria-label="Publication credit" name="credit">
                      <option value="personal">Personal</option>
                      {role === "super_admin" ? (
                        <>
                          <option value="official">Official asset</option>
                          <option value="platform">Created by KnownGDB</option>
                        </>
                      ) : null}
                    </select>
                  </label>
                </>
              ) : (
                <p>
                  A new revision preserves the existing game's identity, role,
                  credit and earlier originals.
                </p>
              )}
              <label>
                Languages
                <input
                  name="languages"
                  placeholder="en, es-uy; leave empty for Global"
                  maxLength={120}
                />
              </label>
              <label>
                Season or event
                <input
                  name="context"
                  defaultValue="base"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Valid from
                <input name="from" type="datetime-local" />
              </label>
              <label>
                Valid until
                <input name="until" type="datetime-local" />
              </label>
              <label>
                Source reference
                <textarea name="source" required maxLength={2000} />
              </label>
              <label>
                Rights evidence
                <textarea name="rights" required maxLength={2000} />
              </label>
              <label>
                Original image
                <input
                  name="original"
                  type="file"
                  accept=".png,.jpg,.jpeg,.ico"
                  required
                />
              </label>
            </fieldset>
            <button disabled={busy || !ready}>
              {busy
                ? "Uploading…"
                : pending.current
                  ? "Retry original upload"
                  : "Submit for review"}
            </button>
          </form>
        </>
      ) : null}
    </section>
  );
}
