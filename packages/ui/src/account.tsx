import { useEffect, useRef, useState, type FormEvent } from "react";
import { Recovery, startsInRecovery } from "./recovery.tsx";
import type { AdminRole } from "@knowngdb/contracts";

// Authentication material is owned by the API's HttpOnly cookie.
export function Account({
  admin = false,
  onRoleChange,
}: {
  admin?: boolean;
  onRoleChange?: (role: AdminRole | null) => void;
}) {
  const [signedIn, setSignedIn] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("");
  const [recovering, setRecovering] = useState(startsInRecovery);
  const sessionRevision = useRef(0);
  const sessionOperation = useRef(false);
  useEffect(() => {
    if (!restoring)
      onRoleChange?.(
        admin && signedIn && (role === "super_admin" || role === "moderator")
          ? role
          : null,
      );
  }, [admin, signedIn, role, restoring, onRoleChange]);
  useEffect(() => {
    if (recovering) {
      setRestoring(false);
      return;
    }
    let active = true;
    async function restore(loadProfile = false) {
      if (sessionOperation.current) return;
      const revision = sessionRevision.current;
      try {
        const response = await fetch("/api/v1/account/session", {
          credentials: "same-origin",
        });
        if (!active || revision !== sessionRevision.current) return;
        if (response.status === 401) {
          setSignedIn(false);
          setRole("");
          setName("");
          return;
        }
        if (!response.ok)
          throw Error("Session verification is temporarily unavailable.");
        const session = await response.json();
        if (!active || revision !== sessionRevision.current) return;
        if (loadProfile) setName(session.profile?.displayName ?? "");
        setSignedIn(true);
        setRole(admin ? (session.role ?? "") : "");
      } catch (error) {
        if (active && revision === sessionRevision.current)
          setMessage(
            error instanceof Error
              ? error.message
              : "Session verification failed.",
          );
      } finally {
        if (active && revision === sessionRevision.current) setRestoring(false);
      }
    }
    void restore(true);
    const sessionChanged = () => void restore(true);
    window.addEventListener("knowngdb-session-changed", sessionChanged);
    const timer = setInterval(() => void restore(), 60_000);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("knowngdb-account")
        : null;
    if (channel) channel.onmessage = () => void restore(true);
    return () => {
      active = false;
      clearInterval(timer);
      channel?.close();
      window.removeEventListener("knowngdb-session-changed", sessionChanged);
    };
  }, [admin, recovering]);
  function announceSession() {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("knowngdb-account");
      channel.postMessage("changed");
      channel.close();
    }
  }
  async function call(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`/api/v1/${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        setSignedIn(false);
        setName("");
        setRole("");
      }
      throw Error(data.error || "Account request failed.");
    }
    return data;
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sessionRevision.current++;
    sessionOperation.current = true;
    const form = event.currentTarget;
    const data = new FormData(form);
    const signup =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "signup";
    setBusy(true);
    setMessage("");
    try {
      const session = await call(
        `account/${signup ? "signup" : "login"}`,
        "POST",
        { email: data.get("email"), password: data.get("password") },
      );
      form.reset();
      if (session.confirmationRequired) {
        setMessage(
          "Check your email to confirm your account, then sign in here.",
        );
        return;
      }
      setSignedIn(true);
      announceSession();
      const account = await call("account/session");
      setName(account.profile?.displayName ?? "");
      setRole(admin ? (account.role ?? "") : "");
      setMessage(
        "Signed in. Your public name is used for personal asset credit.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      sessionRevision.current++;
      sessionOperation.current = false;
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await call("account/profile", "PUT", {
        displayName: name,
      });
      setName(result.profile.displayName);
      setMessage("Public profile saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Profile save failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    sessionRevision.current++;
    sessionOperation.current = true;
    setBusy(true);
    try {
      await call("account/logout", "POST", {});
      setMessage("Signed out.");
    } catch {
      setMessage(
        "Sign-out could not be confirmed. Please retry before leaving a shared device.",
      );
      setBusy(false);
      sessionRevision.current++;
      sessionOperation.current = false;
      return;
    }
    setSignedIn(false);
    setName("");
    setRole("");
    setBusy(false);
    sessionRevision.current++;
    sessionOperation.current = false;
    announceSession();
  }
  if (recovering)
    return (
      <Recovery
        onClose={() => {
          setRecovering(false);
          window.history.replaceState(null, "", window.location.pathname);
        }}
      />
    );
  return (
    <section aria-labelledby="account-heading">
      <h2 id="account-heading">
        {admin ? "Administrator sign-in" : "Contributor account"}
      </h2>
      {restoring ? (
        <div
          className="account-placeholder"
          role="status"
          aria-label="Loading account"
          aria-busy="true"
        >
          <div aria-hidden="true" className="account-placeholder-line" />
          <div aria-hidden="true" className="account-placeholder-field" />
          <div aria-hidden="true" className="account-placeholder-button" />
        </div>
      ) : !signedIn ? (
        <form onSubmit={authenticate}>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              maxLength={128}
            />
          </label>
          <button disabled={busy} value="login">
            Sign in
          </button>
          {!admin ? (
            <button disabled={busy} value="signup">
              Create account
            </button>
          ) : null}
        </form>
      ) : (
        <>
          <p>
            {admin
              ? role
                ? `Administrative role: ${role}.`
                : "No administrative permission confirmed."
              : "Contributor signed in."}
          </p>
          <form onSubmit={save}>
            <label>
              Public display name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
                autoComplete="nickname"
              />
            </label>
            <p>This name is public. Choose how you want to be credited.</p>
            <button disabled={busy}>Save public profile</button>
          </form>
          <button onClick={logout} disabled={busy}>
            Sign out
          </button>
        </>
      )}
      <p role="status" aria-live="polite">
        {busy ? "Working…" : message}
      </p>
      {!signedIn && !restoring ? (
        <button disabled={busy} onClick={() => setRecovering(true)}>
          Forgot password?
        </button>
      ) : null}
      <p>
        Your session survives reloads for up to seven days. Sign out on shared
        devices.
      </p>
    </section>
  );
}
