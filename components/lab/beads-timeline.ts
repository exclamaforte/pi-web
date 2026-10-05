import type { BeadGraphNode } from "@/lib/lab-service";

/** Playback speeds in beads per second. */
export const TIMELINE_SPEEDS = [0.5, 1, 2, 4] as const;

/** Creation-order playback sequence. Beads without a timestamp sort last;
 * ties break by id so the order is stable across renders. */
export function orderBeadsForTimeline(nodes: BeadGraphNode[]): BeadGraphNode[] {
  return [...nodes].sort(
    (a, b) =>
      (a.created_at || "\ufffd").localeCompare(b.created_at || "\ufffd") ||
      a.id.localeCompare(b.id)
  );
}

/** Short date label for the axis (YYYY-MM-DD). */
export function timelineDateLabel(createdAt: string | undefined): string {
  return createdAt ? createdAt.slice(0, 10) : "undated";
}

/** Format timestamp for timeline events (YYYY-MM-DD HH:mm:ss). */
export function formatEventTime(timestamp?: string): string {
  if (!timestamp) return "undated";
  return timestamp.replace("T", " ").replace("Z", "").slice(0, 19);
}

export interface TimelineEvent {
  id: string;
  beadId: string;
  type: "created" | "completed";
  timestamp?: string;
  title: string;
  status: string;
}

export interface NodeTimelineState {
  id: string;
  created: boolean;
  completed: boolean;
  effectiveStatus: string;
  isCurrentChange: boolean;
}

export interface TimelineGraphSnapshot {
  tick: number;
  totalTicks: number;
  currentEvent: TimelineEvent | null;
  nodeStates: Map<string, NodeTimelineState>;
  createdCount: number;
  completedCount: number;
  activeCount: number;
  totalBeads: number;
}

/** Build an ordered list of timeline events (creation vs completion) across all beads. */
export function buildTimelineEvents(nodes: BeadGraphNode[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const n of nodes) {
    // 1. Creation event
    events.push({
      id: `${n.id}:created`,
      beadId: n.id,
      type: "created",
      timestamp: n.created_at,
      title: n.title,
      status: n.status === "closed" ? "open" : n.status,
    });

    // 2. Completion event (if bead is closed or has closed_at)
    if (n.closed_at || n.status === "closed") {
      events.push({
        id: `${n.id}:completed`,
        beadId: n.id,
        type: "completed",
        timestamp: n.closed_at || n.created_at,
        title: n.title,
        status: "closed",
      });
    }
  }

  return events.sort((a, b) => {
    const aTime = a.timestamp || "\ufffd";
    const bTime = b.timestamp || "\ufffd";
    const timeCmp = aTime.localeCompare(bTime);
    if (timeCmp !== 0) return timeCmp;

    // At the same timestamp, "created" must precede "completed"
    if (a.type !== b.type) {
      return a.type === "created" ? -1 : 1;
    }

    return a.beadId.localeCompare(b.beadId);
  });
}

/** Compute graph nodes state at a specific tick in the timeline. */
export function getTimelineGraphState(
  nodes: BeadGraphNode[],
  events: TimelineEvent[],
  tick: number
): TimelineGraphSnapshot {
  const clampedTick = Math.max(0, Math.min(events.length, tick));
  const activeEvents = events.slice(0, clampedTick);
  const currentEvent = clampedTick > 0 ? events[clampedTick - 1] : null;

  const createdBeadIds = new Set<string>();
  const completedBeadIds = new Set<string>();

  for (const ev of activeEvents) {
    if (ev.type === "created") createdBeadIds.add(ev.beadId);
    if (ev.type === "completed") completedBeadIds.add(ev.beadId);
  }

  const nodeStates = new Map<string, NodeTimelineState>();
  for (const n of nodes) {
    const created = createdBeadIds.has(n.id);
    const completed = completedBeadIds.has(n.id);
    let effectiveStatus = "uncreated";
    if (!created) {
      effectiveStatus = "uncreated";
    } else if (completed) {
      effectiveStatus = "closed";
    } else {
      effectiveStatus = n.status === "closed" ? "open" : n.status;
    }

    nodeStates.set(n.id, {
      id: n.id,
      created,
      completed,
      effectiveStatus,
      isCurrentChange: currentEvent?.beadId === n.id,
    });
  }

  const createdCount = createdBeadIds.size;
  const completedCount = completedBeadIds.size;
  const activeCount = createdCount - completedCount;

  return {
    tick: clampedTick,
    totalTicks: events.length,
    currentEvent,
    nodeStates,
    createdCount,
    completedCount,
    activeCount,
    totalBeads: nodes.length,
  };
}
