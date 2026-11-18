import { FeedbackHost, confirmAction } from "./feedback";
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

export function workspaceHref(path: string, admin = false) {
  return `${admin ? "/admin" : ""}${path}`;
}
export function navigateWorkspace(path: string) {
  window.dispatchEvent(new CustomEvent("knowngdb-navigate", { detail: path }));
}

function PublicAdminShortcut() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/v1/account/session", {
          credentials: "same-origin",
        });
        const session = response.ok ? await response.json() : null;
        if (active)
          setAllowed(
            session?.authenticated === true &&
              ["super_admin", "moderator"].includes(session.role),
          );
      } catch {
        if (active) setAllowed(false);
      }
    };
    void refresh();
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("knowngdb-account")
        : null;
    if (channel) channel.onmessage = () => void refresh();
    window.addEventListener("knowngdb-session-changed", refresh);
    return () => {
      active = false;
      channel?.close();
      window.removeEventListener("knowngdb-session-changed", refresh);
    };
  }, []);
  if (!allowed) return null;
  return (
    <a
      className="admin-shortcut"
      href={
        import.meta.env.DEV
          ? `${window.location.protocol}//${window.location.hostname}:${Number(window.location.port) + 1}/admin/games`
          : "/admin/games"
      }
    >
      <ShieldCheck size={17} aria-hidden="true" /> Admin panel
    </a>
  );
}
export function useWorkspaceRoute(
  fallback: string,
  dirty = false,
  admin = false,
) {
  const base = admin ? "/admin" : "";
  const read = () => {
    let path = window.location.pathname;
    if (!admin && path.replace(/\/$/, "") === "/browse") {
      window.history.replaceState(
        window.history.state,
        "",
        `/${window.location.search}${window.location.hash}`,
      );
      path = "/";
    }
    if (admin && path !== base && !path.startsWith(`${base}/`)) return fallback;
    const route = admin ? path.slice(base.length) : path;
    return route.replace(/\/$/, "") || fallback;
  };
  const [route, setRoute] = useState(() => {
    if (window.location.hash.startsWith("#/")) {
      const legacy = window.location.hash.slice(1);
      window.history.replaceState(
        window.history.state,
        "",
        workspaceHref(legacy, admin) + window.location.search,
      );
    }
    return read();
  });
  const accepted = useRef(window.location.pathname + window.location.search);
  const unsaved = useRef(dirty);
  unsaved.current = dirty;
  useEffect(() => {
    let bypassPop = false;
    let confirming = false;
    let restoringDelta: number | null = null;
    let historyIndex =
      typeof window.history.state?.knowngdbIndex === "number"
        ? window.history.state.knowngdbIndex
        : 0;
    window.history.replaceState(
      { ...window.history.state, knowngdbIndex: historyIndex },
      "",
    );
    const apply = () => {
      const nextRoute = read();
      accepted.current = window.location.pathname + window.location.search;
      if (typeof window.history.state?.knowngdbIndex === "number")
        historyIndex = window.history.state.knowngdbIndex;
      setRoute(nextRoute);
    };
    const go = async (url: URL, external: boolean) => {
      if (confirming) return;
      if (unsaved.current) {
        confirming = true;
        const confirmed = await confirmAction(
          "Your unsaved changes will be lost.",
        );
        confirming = false;
        if (!confirmed) return;
      }
      if (external) {
        window.location.assign(url.href);
        return;
      }
      window.history.pushState(
        { knowngdbIndex: historyIndex + 1 },
        "",
        url.pathname + url.search + url.hash,
      );
      apply();
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !link ||
        (link.target && link.target !== "_self") ||
        link.hasAttribute("download")
      )
        return;
      const url = new URL(link.href, window.location.href);
      if (
        url.hash &&
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return;
      const internal =
        url.origin === window.location.origin &&
        (admin
          ? url.pathname === base || url.pathname.startsWith(`${base}/`)
          : !url.pathname.startsWith("/admin") &&
            url.pathname !== "/developers" &&
            !url.pathname.startsWith("/api/"));
      if (!internal && !unsaved.current) return;
      event.preventDefault();
      void go(url, !internal);
    };
    const navigate = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      void go(
        new URL(workspaceHref(path, admin), window.location.origin),
        false,
      );
    };
    const pop = () => {
      if (restoringDelta !== null) {
        const delta = restoringDelta;
        restoringDelta = null;
        confirming = true;
        void confirmAction("Your unsaved changes will be lost.").then(
          (confirmed) => {
            confirming = false;
            if (confirmed) {
              bypassPop = true;
              window.history.go(delta);
            }
          },
        );
        return;
      }
      if (bypassPop) {
        bypassPop = false;
        apply();
        return;
      }
      if (!unsaved.current) {
        apply();
        return;
      }
      const nextIndex = window.history.state?.knowngdbIndex;
      if (typeof nextIndex === "number" && nextIndex !== historyIndex) {
        restoringDelta = nextIndex - historyIndex;
        window.history.go(-restoringDelta);
        return;
      }
      window.history.pushState(
        { knowngdbIndex: historyIndex },
        "",
        accepted.current,
      );
      if (confirming) return;
      confirming = true;
      void confirmAction("Your unsaved changes will be lost.").then(
        (confirmed) => {
          confirming = false;
          if (confirmed) {
            bypassPop = true;
            window.history.back();
          }
        },
      );
    };
    document.addEventListener("click", click);
    window.addEventListener("popstate", pop);
    window.addEventListener("knowngdb-navigate", navigate);
    return () => {
      document.removeEventListener("click", click);
      window.removeEventListener("popstate", pop);
      window.removeEventListener("knowngdb-navigate", navigate);
    };
  }, [fallback, admin, base]);
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
    : "/";
  const items: { path: string; label: string; icon: LucideIcon }[] = admin
    ? [
        { path: "/games", label: "Games", icon: Gamepad2 },
        { path: "/uploads", label: "Upload assets", icon: Upload },
        { path: "/moderation", label: "Moderation", icon: ShieldCheck },
        { path: "/stores", label: "Store observations", icon: Store },
        { path: "/account", label: "Account", icon: UserRound },
      ]
    : [
        { path: "/", label: "Browse", icon: Search },
        { path: "/submit", label: "Submit", icon: Upload },
        { path: "/account", label: "Account", icon: UserRound },
      ];
  return (
    <div className={`workspace-shell ${admin ? "is-admin" : "is-public"}`}>
      <FeedbackHost />
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
              href={workspaceHref(path, admin)}
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
        {!admin && (
          <div className="workspace-utilities">
            <PublicAdminShortcut />
            <a className="workspace-switch" href="/developers">
              Developer API
            </a>
          </div>
        )}
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
        <main
          id="workspace-main"
          className={`workspace-main${!admin && route === "/" ? " catalog-home" : ""}`}
          tabIndex={-1}
        >
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
