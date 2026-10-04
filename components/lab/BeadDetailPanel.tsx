"use client";

import type { BeadItem } from "@/lib/lab-service";

interface Props {
  bead: BeadItem | null;
  loading: boolean;
  error: string | null;
}

/** Shared sidebar detail for the beads-audit views (graph + timeline):
 * full bead text loaded via the show action. */
export function BeadDetailPanel({ bead, loading, error }: Props) {
  return (
    <aside
      aria-label="Bead detail"
      style={{
        width: 330,
        flexShrink: 0,
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxHeight: 560,
        overflowY: "auto",
      }}
    >
      {loading && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading bead…</div>}
      {error && <div style={{ fontSize: 13, color: "#ef4444" }}>{error}</div>}
      {!loading && !error && !bead && (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Click a node to load its full text here.
        </div>
      )}
      {bead && (
        <>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
            {bead.id}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{bead.title}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11, color: "var(--text-muted)" }}>
            <span style={{ padding: "2px 6px", borderRadius: 4, background: "var(--bg-hover)" }}>
              {bead.status}
            </span>
            {bead.issue_type && (
              <span style={{ padding: "2px 6px", borderRadius: 4, background: "var(--bg-hover)" }}>
                {bead.issue_type}
              </span>
            )}
            {typeof bead.priority === "number" && (
              <span style={{ padding: "2px 6px", borderRadius: 4, background: "var(--bg-hover)" }}>
                P{bead.priority}
              </span>
            )}
            {(bead.labels || []).map((lbl) => (
              <span key={lbl} style={{ padding: "2px 6px", borderRadius: 4, background: "var(--bg-selected)" }}>
                {lbl}
              </span>
            ))}
          </div>
          {bead.description && (
            <section>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Description</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{bead.description}</div>
            </section>
          )}
          {bead.design && (
            <section>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Design</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{bead.design}</div>
            </section>
          )}
          {bead.acceptance_criteria && (
            <section>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Acceptance</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {bead.acceptance_criteria}
              </div>
            </section>
          )}
        </>
      )}
    </aside>
  );
}
