import { useState, type FormEvent } from "react";
export function GameCreation({
  onCreated,
}: {
  onCreated: (gameId: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget,
      data = new FormData(form);
    try {
      const response = await fetch("/api/v1/admin/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.get("title"),
          language: data.get("language"),
          source_reference: data.get("source"),
          description: data.get("description"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Game creation failed.");
      form.reset();
      setMessage(
        `Draft created: ${result.game.title}. Select it in the image submission form. Nothing has been published.`,
      );
      onCreated(result.game.id);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Game creation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Game creation">
      {
        <>
          <h2>Create a game draft</h2>
          <p>
            Add the canonical game before uploading its artwork. Check existing
            titles first. The game stays a draft and its assets stay private.
          </p>
          <p role="status">{message}</p>
          <form
            className="submission-form"
            onSubmit={(event) => void create(event)}
          >
            <fieldset disabled={busy}>
              <label>
                Game title
                <input name="title" required maxLength={300} />
              </label>
              <label>
                Title language
                <input
                  name="language"
                  required
                  defaultValue="en"
                  maxLength={35}
                />
              </label>
              <label>
                Game source reference
                <textarea name="source" required maxLength={1000} />
              </label>
              <label>
                Description
                <textarea name="description" maxLength={1500} />
              </label>
            </fieldset>
            <button disabled={busy}>
              {busy ? "Creating…" : "Create draft"}
            </button>
          </form>
        </>
      }
    </section>
  );
}
