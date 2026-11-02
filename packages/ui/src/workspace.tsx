import { useEffect, useRef, useState, type ReactNode } from "react";
import SimpleBar from "simplebar-react";
import {
  Gamepad2,
  Upload,
  ShieldCheck,
  UserRound,
  Search,
  ArrowLeft,
  Store,
  type LucideIcon,
} from "lucide-react";
import "simplebar-react/dist/simplebar.min.css";

export function useWorkspaceRoute(fallback: string, dirty = false) {
  const read = () => window.location.hash.slice(1) || fallback;
  const [route, setRoute] = useState(read);
  const accepted = useRef(route),
    unsaved = useRef(dirty);
  unsaved.current = dirty;
  useEffect(() => {
    const change = () => {
      const next = read();
      if (
        next !== accepted.current &&
        unsaved.current &&
        !window.confirm("Discard unsaved changes and leave this view?")
      ) {
        window.history.replaceState(null, "", `#${accepted.current}`);
        return;
      }
      accepted.current = next;
      setRoute(next);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, [fallback]);
  return route;
}
export function Workspace({
  admin = false,
  route,
  children,
}: {
  admin?: boolean;
  route: string;
  children: ReactNode;
}) {
  const publicCatalogHref = admin
    ? import.meta.env.DEV
      ? `${window.location.protocol}//${window.location.hostname}:${Number(window.location.port) - 1}/`
      : "/"
    : "#/browse";
  const items: { path: string; label: string; icon: LucideIcon }[] = admin
    ? [
        { path: "/games", label: "Games", icon: Gamepad2 },
        { path: "/uploads", label: "Upload assets", icon: Upload },
        { path: "/moderation", label: "Moderation", icon: ShieldCheck },
        { path: "/stores", label: "Store observations", icon: Store },
        { path: "/account", label: "Account", icon: UserRound },
      ]
    : [
        { path: "/browse", label: "Browse", icon: Search },
        { path: "/submit", label: "Submit", icon: Upload },
        { path: "/account", label: "Account", icon: UserRound },
      ];
  return (
    <div className={`workspace-shell ${admin ? "is-admin" : "is-public"}`}>
      <a
        className="skip-link"
        href="#workspace-main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("workspace-main")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="workspace-nav">
        <a
          className="wordmark"
          href={publicCatalogHref}
          aria-label={admin ? "KnownGDB public catalog" : "KnownGDB home"}
        >
          Known<span>GDB</span>
        </a>
        <nav aria-label={admin ? "Administration" : "Main navigation"}>
          {items.map(({ path, label, icon: Icon }) => (
            <a
              key={path}
              href={`#${path}`}
              aria-current={
                route === path ||
                (path === "/games" && route.startsWith("/games/"))
                  ? "page"
                  : undefined
              }
            >
              <Icon size={19} aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>
        {admin ? (
          <a className="workspace-switch" href={publicCatalogHref}>
            Public catalog
          </a>
        ) : null}
      </aside>
      <SimpleBar
        className="workspace-scroll"
        scrollableNodeProps={{
          tabIndex: 0,
          role: "region",
          "aria-label": "Page content",
        }}
      >
        <main id="workspace-main" className="workspace-main" tabIndex={-1}>
          {children}
        </main>
      </SimpleBar>
    </div>
  );
}
export function PageHeading({
  title,
  description,
  back,
  action,
}: {
  title: string;
  description?: string;
  back?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {back ? (
          <a className="back-link" href={back}>
            <ArrowLeft size={16} aria-hidden="true" />
            Back to games
          </a>
        ) : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
