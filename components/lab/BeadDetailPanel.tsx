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
          {bead.close_reason && (
            <section style={{ background: "rgba(107, 114, 128, 0.12)", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>Close Reason</div>
              <div style={{ fontSize: 13, lineHeight: 1.4 }}>{bead.close_reason}</div>
            </section>
          )}
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
          {bead.dependencies && bead.dependencies.length > 0 && (
            <section>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Dependencies ({bead.dependencies.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {bead.dependencies.map((dep, idx) => {
                  const depId = typeof dep === "string" ? dep : dep.depends_on_id;
                  const depType = typeof dep === "object" ? dep.type : undefined;
                  return (
                    <div key={idx} style={{ fontSize: 12, fontFamily: "var(--font-mono)", background: "var(--bg-hover)", padding: "3px 6px", borderRadius: 4 }}>
                      {depType ? `[${depType}] ` : ""}{depId}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {(bead.created_at || bead.closed_at) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              {bead.created_at && (
                <div>Created: <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{bead.created_at}</span></div>
              )}
              {bead.closed_at && (
                <div>Closed: <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{bead.closed_at}</span></div>
              )}
            </div>
          )}
          {bead.comments && bead.comments.length > 0 && (
            <section style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                Comments & History ({bead.comments.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {bead.comments.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: 8,
                      fontSize: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4, fontSize: 11, color: "var(--text-muted)" }}>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{c.author || "User"}</span>
                      <span>{c.created_at ? c.created_at.slice(0, 16).replace("T", " ") : ""}</span>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.text}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </aside>
  );
}
