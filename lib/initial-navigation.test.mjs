import assert from "node:assert/strict";
import test from "node:test";

async function loadSubject() {
  return import("./initial-navigation.ts");
}

test("qualifies a session restore with cwd instead of dropping it", async () => {
  const { getInitialNavigation } = await loadSubject();
  const result = getInitialNavigation(
    new URLSearchParams({
      cwd: " /work/project ",
      session: "saved-session",
    }),
  );

  assert.deepEqual(result, {
    requestedCwd: null,
    sessionId: "saved-session",
    sessionCwd: "/work/project",
    sidebarCollapsed: false,
  });
});

test("restores session when cwd is absent", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams({ session: "saved-session" })),
    { requestedCwd: null, sessionId: "saved-session", sessionCwd: null, sidebarCollapsed: false },
  );
});

test("treats an empty cwd as absent", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(
      new URLSearchParams({ cwd: "  ", session: "saved-session" }),
    ),
    { requestedCwd: null, sessionId: "saved-session", sessionCwd: null, sidebarCollapsed: false },
  );
});

test("preserves a URL-encoded Windows path", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams("cwd=C%3A%5CProjects%5Cpi-web")),
    {
      requestedCwd: "C:\\Projects\\pi-web",
      sessionId: null,
      sessionCwd: null,
      sidebarCollapsed: false,
    },
  );
});

test("keeps the sidebar open when no sidebar parameter is present", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(getInitialNavigation(new URLSearchParams()), {
    requestedCwd: null,
    sessionId: null,
    sessionCwd: null,
    sidebarCollapsed: false,
  });
});

test("collapses the sidebar for sidebar=collapsed", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams({ sidebar: "collapsed" })),
    {
      requestedCwd: null,
      sessionId: null,
      sessionCwd: null,
      sidebarCollapsed: true,
    },
  );
});

test("collapses the sidebar when combined with a cwd parameter", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(
      new URLSearchParams({ cwd: "/work/project", sidebar: "collapsed" }),
    ),
    {
      requestedCwd: "/work/project",
      sessionId: null,
      sessionCwd: null,
      sidebarCollapsed: true,
    },
  );
});

test("collapses the sidebar when combined with a session parameter", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(
      new URLSearchParams({ session: "saved-session", sidebar: "collapsed" }),
    ),
    {
      requestedCwd: null,
      sessionId: "saved-session",
      sessionCwd: null,
      sidebarCollapsed: true,
    },
  );
});

test("ignores any other sidebar value", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams({ sidebar: "expanded" })),
    {
      requestedCwd: null,
      sessionId: null,
      sessionCwd: null,
      sidebarCollapsed: false,
    },
  );
});

test("parses a URL-encoded sidebar parameter", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams("sidebar=collapsed%20")),
    {
      requestedCwd: null,
      sessionId: null,
      sessionCwd: null,
      sidebarCollapsed: false,
    },
  );
});

test("treats an empty session parameter as absent", async () => {
  const { getInitialNavigation } = await loadSubject();

  assert.deepEqual(
    getInitialNavigation(new URLSearchParams({ session: "" })),
    { requestedCwd: null, sessionId: null, sessionCwd: null, sidebarCollapsed: false },
  );
});

test("withTabOpen fills tab memory only when the URL chose nothing", async () => {
  const { withTabOpen } = await loadSubject();
  const empty = { requestedCwd: null, sessionId: null, sessionCwd: null, sidebarCollapsed: false };
  const tabSession = { kind: "session", sessionId: "tab-session" };

  assert.equal(withTabOpen(empty, null), empty);
  assert.deepEqual(
    withTabOpen(empty, tabSession),
    { requestedCwd: null, sessionId: "tab-session", sessionCwd: null, sidebarCollapsed: false },
  );

  const fromUrl = { requestedCwd: null, sessionId: "url-session", sessionCwd: null, sidebarCollapsed: false };
  assert.equal(withTabOpen(fromUrl, tabSession), fromUrl);

  const fromCwd = { requestedCwd: "/work/project", sessionId: null, sessionCwd: null, sidebarCollapsed: true };
  assert.equal(withTabOpen(fromCwd, tabSession), fromCwd);
});

test("withTabOpen carries the remembered cwd for shared session ids", async () => {
  const { withTabOpen } = await loadSubject();
  const empty = { requestedCwd: null, sessionId: null, sessionCwd: null, sidebarCollapsed: false };

  assert.deepEqual(
    withTabOpen(empty, { kind: "session", sessionId: "lab-implementer", cwd: "/labs/b" }),
    { requestedCwd: null, sessionId: "lab-implementer", sessionCwd: "/labs/b", sidebarCollapsed: false },
  );
});

test("withTabOpen restores a remembered new-session composer as cwd", async () => {
  const { withTabOpen } = await loadSubject();
  const empty = { requestedCwd: null, sessionId: null, sessionCwd: null, sidebarCollapsed: false };
  const tabNew = { kind: "new", cwd: "/work/project" };

  assert.deepEqual(
    withTabOpen(empty, tabNew),
    { requestedCwd: "/work/project", sessionId: null, sessionCwd: null, sidebarCollapsed: false },
  );

  const fromUrl = { requestedCwd: null, sessionId: "url-session", sessionCwd: null, sidebarCollapsed: false };
  assert.equal(withTabOpen(fromUrl, tabNew), fromUrl);

  const fromCwd = { requestedCwd: "/other", sessionId: null, sessionCwd: null, sidebarCollapsed: false };
  assert.equal(withTabOpen(fromCwd, tabNew), fromCwd);
});

test("first-render navigation matches SSR even when a tab session exists", async () => {
  const { getInitialNavigation, withTabOpen } = await loadSubject();
  const searchParams = new URLSearchParams();
  const ssr = getInitialNavigation(searchParams);
  const firstClientRender = getInitialNavigation(searchParams);

  assert.deepEqual(ssr, firstClientRender);
  assert.equal(ssr.sessionId, null);
  assert.equal(
    withTabOpen(firstClientRender, { kind: "session", sessionId: "tab-session" }).sessionId,
    "tab-session",
  );
  assert.equal(
    withTabOpen(firstClientRender, { kind: "new", cwd: "/work/project" }).requestedCwd,
    "/work/project",
  );
});
