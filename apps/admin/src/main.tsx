import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Health, AdminRole } from "@knowngdb/contracts";
import "@knowngdb/ui/workspace.css";
import { Account } from "@knowngdb/ui/account";
import { VersionAdministration } from "./versions.tsx";

function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [role, setRole] = useState<AdminRole | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/health", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setHealth)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("The local API is unavailable.");
      });
    return () => controller.abort();
  }, []);
  return (
    <>
      <header>
        <strong>KnownGDB</strong>
        <span>Administration workspace</span>
      </header>
      <main>
        <Account admin onRoleChange={setRole} />
        <h1>Catalog operations.</h1>
        <p>
          The administration application has its own entry point and build.
          Access to administrative data is enforced by the API.
        </p>
        <h2>Connection</h2>
        <p role={error ? "alert" : undefined}>
          {error ||
            (health
              ? "Local API connected. Administrative permission is verified when you sign in."
              : "Connecting to the API…")}
        </p>
        <h2>Publication identity</h2>
        <p>
          An authenticated Super Admin can choose Official asset, Created by
          KnownGDB or Personal. The uploader remains recorded independently.
          Personal community credit requires a registered contributor profile.
        </p>
        <h2>Asset history</h2>
        <p>
          Language, season, event and validity belong to version metadata.
          Publishing a new cover or logo must preserve earlier originals and
          their history.
        </p>
        {role ? (
          <VersionAdministration role={role} />
        ) : (
          <p>
            Sign in with administrative permission to review asset versions.
          </p>
        )}
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
