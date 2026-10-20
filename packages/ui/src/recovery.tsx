import { useEffect, useState, type FormEvent } from "react";

// Consume Auth fragments before rendering; never persist or log recovery tokens.
const fragment = new URLSearchParams(window.location.hash.slice(1));
let initialRecovery =
  fragment.get("type") === "recovery"
    ? {
        accessToken: fragment.get("access_token") ?? "",
        refreshToken: fragment.get("refresh_token") ?? "",
        expiresAt:
          Number(fragment.get("expires_at")) ||
          Date.now() / 1000 + Number(fragment.get("expires_in") || 0),
      }
    : null;
const recoveryError = fragment.has("error") || fragment.has("error_code");
if (
  fragment.has("access_token") ||
  fragment.has("error") ||
  fragment.has("error_code")
)
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
fragment.delete("access_token");
fragment.delete("refresh_token");

export function Recovery({ onClose }: { onClose: () => void }) {
  const [session, setSession] = useState(initialRecovery);
  useEffect(() => {
    initialRecovery = null;
  }, []);
  const [message, setMessage] = useState(
    recoveryError
      ? "Recovery link is invalid or expired. Request a new link."
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => {
        setSession(null);
        setMessage("Recovery link is invalid or expired. Request a new link.");
      },
      Math.max(0, Math.min(2147483647, session.expiresAt * 1000 - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [session]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (session && fields.get("password") !== fields.get("confirmation")) {
      setMessage("Passwords do not match.");
      return;
    }
    if (
      session &&
      (!session.accessToken ||
        !session.refreshToken ||
        session.expiresAt <= Date.now() / 1000)
    ) {
      setSession(null);
      setMessage("Recovery link is invalid or expired. Request a new link.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/account/${session ? "password" : "recover"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session
              ? { Authorization: `Bearer ${session.accessToken}` }
              : {}),
          },
          body: JSON.stringify(
            session
              ? {
                  password: fields.get("password"),
                  refreshToken: session.refreshToken,
                }
              : { email: fields.get("email") },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) setSession(null);
        throw Error(data.error || "Recovery is temporarily unavailable.");
      }
      form.reset();
      if (session) {
        setSession(null);
        setComplete(true);
        setMessage(
          data.sessionsRevoked
            ? "Password updated. Sign in with your new password."
            : "Password updated. Sign in with your new password. Revocation of other sessions could not be confirmed.",
        );
      } else setMessage(data.message);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Recovery is temporarily unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="recovery-heading">
      <h2 id="recovery-heading">
        {session ? "Set a new password" : "Reset your password"}
      </h2>
      {!complete ? (
        <form onSubmit={submit}>
          {session ? (
            <>
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </label>
              <label>
                Confirm new password
                <input
                  name="confirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </label>
            </>
          ) : (
            <label>
              Account email
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </label>
          )}
          <button disabled={busy}>
            {session ? "Save new password" : "Send recovery email"}
          </button>
        </form>
      ) : null}
      <p role="status" aria-live="polite">
        {busy ? "Working…" : message}
      </p>
      <button
        disabled={busy}
        onClick={() => {
          setSession(null);
          onClose();
        }}
      >
        Back to sign in
      </button>
    </section>
  );
}

export const startsInRecovery = Boolean(
  initialRecovery ||
  recoveryError ||
  new URLSearchParams(window.location.search).get("recovery") === "1",
);
