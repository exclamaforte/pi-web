import type { TabOpen } from "./tab-session";

export interface InitialNavigation {
  requestedCwd: string | null;
  sessionId: string | null;
  sessionCwd: string | null;
  sidebarCollapsed: boolean;
}

export function getInitialNavigation(
  searchParams: Pick<URLSearchParams, "get">,
): InitialNavigation {
  // A bare `?cwd=` still means a new-session composer. When `?session=` is
  // present the same param qualifies which same-id session to restore
  // (lab workers reuse `lab-<role>` per lab), so it must not become a composer.
  const sessionId = searchParams.get("session") || null;
  const cwdParam = searchParams.get("cwd")?.trim() || null;

  return {
    requestedCwd: sessionId ? null : cwdParam,
    sessionId,
    sessionCwd: sessionId ? cwdParam : null,
    sidebarCollapsed: searchParams.get("sidebar") === "collapsed",
  };
}

/**
 * Apply per-tab memory to a navigation snapshot that was taken from the URL
 * alone. Returns the same object when the URL already chose a cwd or session,
 * or when this tab has nothing stored.
 *
 * A remembered session fills `sessionId` (plus `sessionCwd` when the same id
 * exists in several cwds). A remembered new-session composer
 * fills `requestedCwd` so reload shows that UI instead of the previous chat.
 *
 * Call this after mount. Reading sessionStorage during the first client render
 * (including a `useState` initializer) makes SSR HTML diverge from the client
 * tree — sessionStorage is empty on the server — and React reports a
 * hydration text mismatch in the sidebar / placeholder.
 */
export function withTabOpen(
  navigation: InitialNavigation,
  tabOpen: TabOpen | null,
): InitialNavigation {
  if (navigation.requestedCwd || navigation.sessionId || !tabOpen) {
    return navigation;
  }
  if (tabOpen.kind === "session") {
    return { ...navigation, sessionId: tabOpen.sessionId, sessionCwd: tabOpen.cwd ?? null };
  }
  return { ...navigation, requestedCwd: tabOpen.cwd };
}
