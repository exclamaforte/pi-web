import type { BeadGraphNode } from "@/lib/lab-service";

export interface PositionedBead extends BeadGraphNode {
  x: number;
  y: number;
}

export interface PositionedEdge {
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BeadGraphLayout {
  nodes: PositionedBead[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

export const NODE_W = 190;
export const NODE_H = 46;
export const X_STEP = 250;
export const Y_STEP = 66;
export const PAD = 48;

export interface StatusColor {
  fill: string;
  stroke: string;
}

/** Node fill/stroke by bead status; label chips (needs-review etc.) are
 * rendered separately in the component — statuses are the bd-level ones. */
export const STATUS_COLORS: Record<string, StatusColor> = {
  open: { fill: "rgba(16, 185, 129, 0.14)", stroke: "#10b981" },
  in_progress: { fill: "rgba(59, 130, 246, 0.14)", stroke: "#3b82f6" },
  blocked: { fill: "rgba(239, 68, 68, 0.14)", stroke: "#ef4444" },
  closed: { fill: "rgba(107, 114, 128, 0.14)", stroke: "#6b7280" },
};

export const DEFAULT_STATUS_COLOR: StatusColor = {
  fill: "rgba(139, 92, 246, 0.14)",
  stroke: "#8b5cf6",
};

export function colorForStatus(status: string): StatusColor {
  return STATUS_COLORS[status] ?? DEFAULT_STATUS_COLOR;
}

/** Layered layout: a bead's layer is one past the deepest prerequisite it
 * depends on (roots at layer 0), so arrows always flow left to right.
 * A dependency cycle cannot loop the resolver: the in-progress bead
 * resolves as a root, nesting cycle members by discovery order. */
export function layoutBeadGraph(nodes: BeadGraphNode[]): BeadGraphLayout {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const resolve = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // cycle guard: treat as root here
    const node = byId.get(id);
    if (!node) return 0;
    visiting.add(id);
    let d = 0;
    for (const dep of node.deps) {
      if (byId.has(dep)) d = Math.max(d, resolve(dep) + 1);
    }
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };

  for (const n of nodes) resolve(n.id);

  const layers = new Map<number, PositionedBead[]>();
  for (const n of nodes) {
    const layer = depth.get(n.id) ?? 0;
    const list = layers.get(layer) ?? [];
    list.push({ ...n, x: 0, y: 0 });
    layers.set(layer, list);
  }
  const orderedLayers = [...layers.keys()].sort((a, b) => a - b);
  let height = PAD * 2;
  for (const layer of orderedLayers) {
    const list = layers.get(layer)!;
    list.sort(
      (a, b) =>
        (a.created_at || "").localeCompare(b.created_at || "") ||
        a.id.localeCompare(b.id)
    );
    list.forEach((n, i) => {
      n.x = PAD + layer * X_STEP;
      n.y = PAD + i * Y_STEP;
    });
    height = Math.max(height, PAD * 2 + list.length * Y_STEP);
  }

  const pos = new Map<string, PositionedBead>();
  for (const list of layers.values()) for (const n of list) pos.set(n.id, n);

  const edges: PositionedEdge[] = [];
  for (const n of pos.values()) {
    for (const dep of n.deps) {
      const from = pos.get(dep);
      if (!from) continue; // prerequisite outside this lab snapshot
      edges.push({
        fromId: dep,
        toId: n.id,
        x1: from.x + NODE_W,
        y1: from.y + NODE_H / 2,
        x2: n.x,
        y2: n.y + NODE_H / 2,
      });
    }
  }

  const maxLayer = orderedLayers.length > 0 ? orderedLayers[orderedLayers.length - 1] : 0;
  return {
    nodes: [...pos.values()],
    edges,
    width: PAD * 2 + maxLayer * X_STEP + NODE_W,
    height,
  };
}
