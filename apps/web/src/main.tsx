import { Account } from "@knowngdb/ui/account";
import { FeedbackHost } from "@knowngdb/ui/feedback";
import { lazy, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Workspace,
  PageHeading,
  useWorkspaceRoute,
} from "@knowngdb/ui/workspace";
import { startsInRecovery } from "@knowngdb/ui/recovery-state";
import { CatalogPage } from "./catalog/catalog-page";
import { GameDetail } from "./game-detail";
import { LoaderCircle } from "lucide-react";
import "@knowngdb/ui/workspace.css";
import "./catalog/theme.css";

const AssetSubmission = lazy(() =>
  import("@knowngdb/ui/submission").then((module) => ({
    default: module.AssetSubmission,
  })),
);
const Developers = lazy(() =>
  import("./developers.tsx").then((module) => ({ default: module.Developers })),
);

function RouteFallback({ label = "Opening this page" }: { label?: string }) {
  return (
    <div className="route-pending" role="status">
      <LoaderCircle size={17} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function App() {
  const [dirty, setDirty] = useState(false);
  const route = useWorkspaceRoute(startsInRecovery ? "/account" : "/", dirty);
  const parts = route.split("/");
  return (
    <Workspace route={route}>
      {route === "/" ? (
        <CatalogPage />
      ) : route === "/account" ? (
        <div className="account-view">
          <PageHeading
            title="Your account"
            description="Sign in to contribute and manage your public profile."
          />
          <section className="surface">
            <Account />
          </section>
        </div>
      ) : route === "/submit" ? (
        <>
          <PageHeading
            title="Submit an asset"
            description="Keep original artwork connected to its game and creator."
          />
          <section className="surface narrow">
            <Suspense fallback={<RouteFallback />}>
              <AssetSubmission standalone onDirtyChange={setDirty} />
            </Suspense>
          </section>
        </>
      ) : parts[1] === "games" && parts[2] ? (
        <GameDetail key={route} gameId={parts[2]} language={parts[3] ?? "en"} />
      ) : (
        <PageHeading title="Page not found" back="/" />
      )}
    </Workspace>
  );
}

createRoot(document.getElementById("root")!).render(
  window.location.pathname.replace(/\/$/, "") === "/developers" ? (
    <>
      <FeedbackHost />
      <Suspense
        fallback={
          <Workspace route="/developers">
            <PageHeading
              title="Developer API"
              description="Reference and tools for the KnownGDB catalog API."
            />
            <RouteFallback label="Opening API reference" />
          </Workspace>
        }
      >
        <Developers />
      </Suspense>
    </>
  ) : (
    <App />
  ),
);
