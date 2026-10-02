import type { SessionInfo } from "./types";

export interface SessionFamily {
  root: SessionInfo;
  subagents: SessionInfo[];
  latestModified: string;
}

// Session identity is (cwd, id): lab workers reuse `lab-<role>` in every lab
// directory, so keying families by id alone merges two labs' rows into one.
function familyKeyOf(session: Pick<SessionInfo, "id" | "cwd">): string {
  return session.cwd ? `${session.cwd}::${session.id}` : session.id;
}

function resolveFamilyRoots(sessions: readonly SessionInfo[]): Map<string, string | null> {
  const byKey = new Map(sessions.map((session) => [familyKeyOf(session), session]));
  const byId = new Map<string, SessionInfo[]>();
  for (const session of sessions) {
    const list = byId.get(session.id);
    if (list) list.push(session);
    else byId.set(session.id, [session]);
  }
  const roots = new Map<string, string | null>();

  const resolveParent = (session: SessionInfo, parentId: string): SessionInfo | undefined => {
    const sameCwd = session.cwd
      ? byKey.get(session.cwd ? `${session.cwd}::${parentId}` : parentId)
      : undefined;
    if (sameCwd) return sameCwd;
    const candidates = byId.get(parentId);
    if (!candidates || candidates.length !== 1) return undefined;
    return candidates[0];
  };

  for (const session of sessions) {
    const key = familyKeyOf(session);
    if (roots.has(key)) continue;

    const path: string[] = [];
    const visited = new Set<string>();
    let currentKey = key;
    let current: SessionInfo | undefined = session;
    let rootKey: string | null = null;

    while (true) {
      if (roots.has(currentKey)) {
        rootKey = roots.get(currentKey) ?? null;
        break;
      }
      if (visited.has(currentKey)) break;

      visited.add(currentKey);
      path.push(currentKey);
      if (!current) break;
      if (current.relation?.kind !== "subagent") {
        rootKey = currentKey;
        break;
      }
      const parent = resolveParent(current, current.relation.parentSessionId);
      if (!parent) break;
      current = parent;
      currentKey = familyKeyOf(parent);
    }

    for (const id of path) roots.set(id, rootKey);
  }

  return roots;
}

/** Groups visible main/fork sessions with every persisted subagent descendant. */
export function listSessionFamilies(sessions: readonly SessionInfo[]): SessionFamily[] {
  const rootsBySessionKey = resolveFamilyRoots(sessions);
  const families = new Map<string, SessionFamily>();

  for (const session of sessions) {
    if (session.relation?.kind === "subagent") continue;
    families.set(familyKeyOf(session), {
      root: session,
      subagents: [],
      latestModified: session.modified,
    });
  }

  for (const session of sessions) {
    if (session.relation?.kind !== "subagent") continue;
    const rootKey = rootsBySessionKey.get(familyKeyOf(session));
    const family = rootKey ? families.get(rootKey) : undefined;
    if (!family) continue;
    family.subagents.push(session);
    if (session.modified > family.latestModified) family.latestModified = session.modified;
  }

  return [...families.values()].sort((a, b) => b.latestModified.localeCompare(a.latestModified));
}

export function getSessionFamily(
  sessions: readonly SessionInfo[],
  sessionId: string | null | undefined,
  cwd?: string | null,
): SessionFamily | null {
  if (!sessionId) return null;
  const families = listSessionFamilies(sessions);
  if (cwd) {
    const key = `${cwd}::${sessionId}`;
    const exact = families.find((family) => (
      familyKeyOf(family.root) === key
      || family.subagents.some((session) => familyKeyOf(session) === key)
    ));
    if (exact) return exact;
  }
  return families.find((family) => (
    family.root.id === sessionId
    || family.subagents.some((session) => session.id === sessionId)
  )) ?? null;
}
