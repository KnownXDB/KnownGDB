import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { AdminRole } from "@knowngdb/contracts";
import {
  Workspace,
  PageHeading,
  useWorkspaceRoute,
} from "@knowngdb/ui/workspace";
import { Account } from "@knowngdb/ui/account";
import { AssetSubmission } from "@knowngdb/ui/submission";
import { GameCreation } from "./games.tsx";
import { GamesView } from "./game-list.tsx";
import { StoreObservations } from "./store-observations.tsx";
import { VersionAdministration } from "./versions.tsx";
import "@knowngdb/ui/workspace.css";
function App() {
  const [role, setRole] = useState<AdminRole | null | undefined>(undefined),
    [dirty, setDirty] = useState(false),
    [revision, setRevision] = useState(0);
  const route = useWorkspaceRoute("/games", dirty),
    parts = route.split("/");
  const changed = () => setRevision((v) => v + 1);
  return (
    <Workspace admin route={route}>
      <div
        hidden={Boolean(role) && route !== "/account"}
        className="account-view"
      >
        <PageHeading
          title={role ? "Your account" : "Administration sign-in"}
          description="Manage your account and public contributor profile."
        />
        <section className="surface">
          <Account admin onRoleChange={setRole} />
        </section>
      </div>
      {role && route !== "/account" ? (
        <>
          {route === "/games/new" ? (
            <>
              <PageHeading
                title="Add a game"
                description="Create its canonical record first. Add detailed information in the game editor."
                back="#/games"
              />
              <div className="surface narrow">
                <GameCreation
                  onCreated={(id) => {
                    changed();
                    window.location.hash = `/games/${id}`;
                  }}
                />
              </div>
            </>
          ) : parts[1] === "games" ? (
            <GamesView
              role={role}
              revision={revision}
              onChanged={changed}
              gameId={parts[2]}
              visibility={parts[3] === "visibility"}
              onDirtyChange={setDirty}
            />
          ) : route === "/uploads" ? (
            <>
              <PageHeading
                title="Upload assets"
                description="Choose a game, describe the original and submit it for review."
              />
              <section className="surface narrow">
                <AssetSubmission
                  onDirtyChange={setDirty}
                  standalone
                  role={role}
                  catalogRevision={revision}
                  onSubmitted={changed}
                />
              </section>
            </>
          ) : route === "/moderation" ? (
            <>
              <PageHeading
                title="Moderation"
                description="Inspect one asset at a time. Review and publication remain separate actions."
              />
              <VersionAdministration role={role} />
            </>
          ) : route === "/stores" ? (
            <StoreObservations role={role} />
          ) : (
            <PageHeading title="Page not found" back="#/games" />
          )}
        </>
      ) : null}
    </Workspace>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
