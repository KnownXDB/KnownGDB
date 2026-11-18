import { Disclosure, FilePicker, Select } from "./controls";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  assetRoles,
  imageUploadLimit,
  type AdminRole,
  type GameSummary,
} from "@knowngdb/contracts";

function validateLocalDate(event: React.ChangeEvent<HTMLInputElement>) {
  const field = event.currentTarget;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(field.value);
  if (!field.value || !match) {
    field.setCustomValidity("");
    return;
  }
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute;
  field.setCustomValidity(valid ? "" : "Enter a valid local date and time.");
}

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
  catalogRevision = 0,
  standalone = false,
  onDirtyChange,
}: {
  role?: AdminRole | null;
  catalogRevision?: number;
  onSubmitted?: () => void;
  standalone?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [open, setOpen] = useState(standalone),
    [games, setGames] = useState<GameSummary[]>([]),
    [collections, setCollections] = useState<Collection[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const [busy, setBusy] = useState(false),
    [access, setAccess] = useState<"loading" | "anonymous" | "ready" | "error">(
      "loading",
    ),
    [message, setMessage] = useState(""),
    [collection, setCollection] = useState("");
  const ready = access === "ready";
  const pending = useRef<{ id: string; file: File } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const selected = collections.find((c) => c.id === collection);
  const [accountRevision, setAccountRevision] = useState(0);
  useEffect(() => {
    const changed = () => {
      controller.current?.abort();
      pending.current = null;
      setCollection("");
      setAccess("loading");
      setHasChanges(false);
      setMessage("");
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
    setAccess("loading");
    setMessage("");
    async function load() {
      const options = await fetch("/api/v1/submissions", {
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      if (options.status === 401) {
        setAccess("anonymous");
        return;
      }
      const own = await options.json();
      if (!options.ok)
        throw Error(
          own.error || "Submission options are temporarily unavailable.",
        );
      const response = await fetch(
        role ? "/api/v1/admin/games" : "/api/v1/games",
        { signal: abort.signal },
      );
      if (!response.ok)
        throw Error("Game selection is temporarily unavailable.");
      const catalog = await response.json();
      if (abort.signal.aborted) return;
      setGames(
        (catalog.games ?? []).filter(
          (game: GameSummary & { status?: string }) =>
            game.status !== "withdrawn",
        ),
      );
      setCollections(own.collections ?? []);
      setAccess("ready");
    }
    void load().catch((error) => {
      if (abort.signal.aborted) return;
      setAccess("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Submission options are temporarily unavailable.",
      );
    });
    return () => abort.abort();
  }, [open, accountRevision, role, catalogRevision]);
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
    setHasChanges(false);
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
        file.size > imageUploadLimit
      )
        throw Error("Use a PNG, JPEG or client ICO no larger than 4 MiB.");
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
      {!standalone ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
        >
          {open ? "Close submission" : "Submit an image"}
        </button>
      ) : null}
      {open && !ready ? (
        access === "anonymous" ? (
          <p>
            <a href="/account">Sign in or create an account</a> to submit an
            asset.
          </p>
        ) : (
          <>
            <p role="status">
              {access === "error" ? message : "Checking submission access…"}
            </p>
            {access === "error" && (
              <button
                type="button"
                onClick={() => setAccountRevision((value) => value + 1)}
              >
                Retry submission options
              </button>
            )}
          </>
        )
      ) : open ? (
        <>
          <h2>Submit an original image</h2>
          <p>
            PNG, JPEG and client ICO originals up to 4 MiB are supported.
            Submissions stay private until reviewed and explicitly published.
          </p>
          <p role="status">{message}</p>
          {pending.current ? (
            <p>
              The original is reserved. Retry with the same file without
              creating another version.
            </p>
          ) : null}
          <form
            className="submission-form"
            onChange={() => setHasChanges(true)}
            onSubmit={(e) => void submit(e)}
          >
            <fieldset disabled={busy || !ready || Boolean(pending.current)}>
              <label>
                Version history
                <Select
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
                </Select>
              </label>
              {!selected ? (
                <>
                  <label>
                    Game
                    <Select aria-label="Game" name="game" required>
                      <option value="">Select a game</option>
                      {games
                        .filter(
                          (g, i, a) => a.findIndex((x) => x.id === g.id) === i,
                        )
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.title}
                            {(g as GameSummary & { status?: string }).status ===
                            "draft"
                              ? " (Draft)"
                              : ""}
                          </option>
                        ))}
                    </Select>
                  </label>
                  <label>
                    Asset type
                    <Select aria-label="Asset type" name="role">
                      {assetRoles
                        .filter((r) => r !== "trailer")
                        .map((r) => (
                          <option key={r} value={r}>
                            {r.replaceAll("_", " ")}
                          </option>
                        ))}
                    </Select>
                  </label>
                  <label>
                    Publication credit
                    <Select aria-label="Publication credit" name="credit">
                      <option value="personal">Personal</option>
                      {role === "super_admin" ? (
                        <>
                          <option value="official">Official asset</option>
                          <option value="platform">Created by KnownGDB</option>
                        </>
                      ) : null}
                    </Select>
                  </label>
                </>
              ) : (
                <p>
                  A new revision preserves the existing game's identity, role,
                  credit and earlier originals.
                </p>
              )}
              <Disclosure title="Language, season and validity (optional)">
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
                  <input
                    name="from"
                    type="text"
                    onChange={validateLocalDate}
                    placeholder="YYYY-MM-DDTHH:mm"
                    pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}"
                  />
                </label>
                <label>
                  Valid until
                  <input
                    name="until"
                    type="text"
                    onChange={validateLocalDate}
                    placeholder="YYYY-MM-DDTHH:mm"
                    pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}"
                  />
                </label>
              </Disclosure>
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
                <FilePicker
                  name="original"
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
