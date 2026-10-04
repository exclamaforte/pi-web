import type { BeadGraphNode } from "@/lib/lab-service";

/** Playback speeds in beads per second. */
export const TIMELINE_SPEEDS = [0.5, 1, 2, 4] as const;

/** Creation-order playback sequence. Beads without a timestamp sort last;
 * ties break by id so the order is stable across renders. */
export function orderBeadsForTimeline(nodes: BeadGraphNode[]): BeadGraphNode[] {
  return [...nodes].sort(
    (a, b) =>
      (a.created_at || "￿").localeCompare(b.created_at || "￿") ||
      a.id.localeCompare(b.id)
  );
}

/** Short date label for the axis (YYYY-MM-DD). */
export function timelineDateLabel(createdAt: string | undefined): string {
  return createdAt ? createdAt.slice(0, 10) : "undated";
}
