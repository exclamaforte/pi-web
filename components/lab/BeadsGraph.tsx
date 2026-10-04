"use client";

import { useEffect, useMemo, useState } from "react";
import type { BeadGraphNode, BeadItem } from "@/lib/lab-service";
import {
  NODE_W,
  NODE_H,
  colorForStatus,
  layoutBeadGraph,
} from "./beads-graph-layout";

interface Props {
  labPath: string;
}

interface DetailState {
  loading: boolean;
  bead: BeadItem | null;
  error: string | null;
}

const LEGEND = [
  { status: "open", label: "Open" },
  { status: "in_progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
  { status: "closed", label: "Closed" },
];

function shortId(id: string): string {
  return id.length > 22 ? `${id.slice(0, 10)}…${id.slice(-10)}` : id;
}

export function BeadsGraph({ labPath }: Props) {
  const [nodes, setNodes] = useState<BeadGraphNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ loading: false, bead: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setNodes(null);
    setError(null);
    setSelectedId(null);
    setDetail({ loading: false, bead: null, error: null });
    fetch(`/api/lab/beads?path=${encodeURIComponent(labPath)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!cancelled) {
          if (json.success && Array.isArray(json.data)) setNodes(json.data);
          else setError(json.error || "Failed to load beads graph");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [labPath]);

  const layout = useMemo(() => (nodes ? layoutBeadGraph(nodes) : null), [nodes]);

  const openBead = async (id: string) => {
    setSelectedId(id);
    setDetail({ loading: true, bead: null, error: null });
    try {
      const res = await fetch("/api/lab/beads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "show", path: labPath, bdId: id }),
      });
      const json = await res.json();
      if (json.success) setDetail({ loading: false, bead: json.data, error: null });
      else setDetail({ loading: false, bead: null, error: json.error || "Failed to load bead" });
    } catch (e) {
      setDetail({ loading: false, bead: null, error: String(e) });
    }
  };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
          {LEGEND.map((l) => (
            <span key={l.status} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-muted)" }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: colorForStatus(l.status).fill,
                  border: `2px solid ${colorForStatus(l.status).stroke}`,
                }}
              />
              {l.label}
            </span>
          ))}
        </div>
        {error && (
          <div style={{ padding: 16, color: "#ef4444", fontSize: 13 }}>Graph failed: {error}</div>
        )}
        {!nodes && !error && (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Loading dependency graph…
          </div>
        )}
        {layout && layout.nodes.length === 0 && (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No beads in this lab.
          </div>
        )}
        {layout && layout.nodes.length > 0 && (
          <div style={{ overflow: "auto", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8 }}>
            <svg width={layout.width} height={layout.height} role="img" aria-label="Beads dependency graph">
              <defs>
                <marker id="bead-edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" />
                </marker>
              </defs>
              {layout.edges.map((e) => (
                <line
                  key={`${e.fromId}->${e.toId}`}
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2 - 3}
                  y2={e.y2}
                  stroke="var(--text-muted)"
                  strokeWidth="1.5"
                  markerEnd="url(#bead-edge-arrow)"
                />
              ))}
              {layout.nodes.map((n) => {
                const c = colorForStatus(n.status);
                const selected = n.id === selectedId;
                return (
                  <g
                    key={n.id}
                    onClick={() => openBead(n.id)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    aria-label={`Bead ${n.id}`}
                  >
                    <title>{`${n.id}\n${n.title}`}</title>
                    <rect
                      x={n.x}
                      y={n.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={8}
                      fill={c.fill}
                      stroke={selected ? "var(--accent)" : c.stroke}
                      strokeWidth={selected ? 3 : 2}
                    />
                    <text x={n.x + 10} y={n.y + 18} fontSize={11} fontWeight={700} fill="var(--text)" fontFamily="var(--font-mono)">
                      {shortId(n.id)}
                    </text>
                    <text x={n.x + 10} y={n.y + 34} fontSize={11} fill="var(--text-muted)">
                      {n.title.length > 26 ? `${n.title.slice(0, 25)}…` : n.title}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>
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
        {detail.loading && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading bead…</div>}
        {detail.error && <div style={{ fontSize: 13, color: "#ef4444" }}>{detail.error}</div>}
        {!detail.loading && !detail.error && !detail.bead && (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Click a node to load its full text here.
          </div>
        )}
        {detail.bead && (
          <>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
              {detail.bead.id}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{detail.bead.title}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11, color: "var(--text-muted)" }}>
              <span style={{ padding: "2px 6px", borderRadius: 4, background: "var(--bg-hover)" }}>
                {detail.bead.status}
              </span>
              {detail.bead.issue_type && (
                <span style={{ padding: "2px 6px", borderRadius: 4, background: "var(--bg-hover)" }}>
                  {detail.bead.issue_type}
                </span>
              )}
              {typeof detail.bead.priority === "number" && (
                <span style={{ padding: "2px 6px", borderRadius: 4, background: "var(--bg-hover)" }}>
                  P{detail.bead.priority}
                </span>
              )}
              {(detail.bead.labels || []).map((lbl) => (
                <span key={lbl} style={{ padding: "2px 6px", borderRadius: 4, background: "var(--bg-selected)" }}>
                  {lbl}
                </span>
              ))}
            </div>
            {detail.bead.description && (
              <section>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Description</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{detail.bead.description}</div>
              </section>
            )}
            {detail.bead.design && (
              <section>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Design</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{detail.bead.design}</div>
              </section>
            )}
            {detail.bead.acceptance_criteria && (
              <section>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Acceptance</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {detail.bead.acceptance_criteria}
                </div>
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
