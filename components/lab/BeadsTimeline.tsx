"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { BeadGraphNode, BeadItem } from "@/lib/lab-service";
import {
  NODE_W,
  NODE_H,
  colorForStatus,
  layoutBeadGraph,
  getEdgeHighlight,
  EDGE_HIGHLIGHT_COLORS,
} from "./beads-graph-layout";
import {
  TIMELINE_SPEEDS,
  buildTimelineEvents,
  formatEventTime,
  getTimelineGraphState,
  orderBeadsForTimeline,
  timelineDateLabel,
} from "./beads-timeline";
import { BeadDetailPanel } from "./BeadDetailPanel";
import { GraphScrollContainer } from "./GraphScrollContainer";

interface Props {
  labPath: string;
}

interface DetailState {
  loading: boolean;
  bead: BeadItem | null;
  error: string | null;
}

function shortId(id: string): string {
  return id.length > 22 ? `${id.slice(0, 10)}…${id.slice(-10)}` : id;
}

export function BeadsTimeline({ labPath }: Props) {
  const [nodes, setNodes] = useState<BeadGraphNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ loading: false, bead: null, error: null });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNodes(null);
    setError(null);
    setRevealed(0);
    setPlaying(false);
    setSelectedId(null);
    setDetail({ loading: false, bead: null, error: null });
    fetch(`/api/lab/beads?path=${encodeURIComponent(labPath)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!cancelled) {
          if (json.success && Array.isArray(json.data)) {
            setNodes(json.data);
            const events = buildTimelineEvents(json.data);
            // Default revealed to the end so user sees full graph initially, can scrub back
            setRevealed(events.length);
          } else {
            setError(json.error || "Failed to load beads timeline");
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [labPath]);

  const ordered = useMemo(() => (nodes ? orderBeadsForTimeline(nodes) : null), [nodes]);
  const events = useMemo(() => (nodes ? buildTimelineEvents(nodes) : []), [nodes]);
  const total = events.length;
  const layout = useMemo(() => (nodes ? layoutBeadGraph(nodes) : null), [nodes]);
  const sortedEdges = useMemo(() => {
    if (!layout) return [];
    if (!selectedId) return layout.edges;
    return [...layout.edges].sort((a, b) => {
      const aH = a.toId === selectedId || a.fromId === selectedId ? 1 : 0;
      const bH = b.toId === selectedId || b.fromId === selectedId ? 1 : 0;
      return aH - bH;
    });
  }, [layout, selectedId]);

  const timelineState = useMemo(
    () => (nodes && events.length > 0 ? getTimelineGraphState(nodes, events, revealed) : null),
    [nodes, events, revealed]
  );

  useEffect(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (playing && total > 0 && revealed < total) {
      timer.current = setInterval(() => {
        setRevealed((r) => {
          if (r + 1 >= total) {
            setPlaying(false);
            return total;
          }
          return r + 1;
        });
      }, 1000 / speed);
    }
    return () => {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
  }, [playing, speed, total, revealed]);

  const step = (delta: number) => {
    setPlaying(false);
    setRevealed((r) => Math.min(total, Math.max(0, r + delta)));
  };

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

  const currentEvent = timelineState?.currentEvent;

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Playback Controls & Scrubber */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <button onClick={() => { setPlaying(false); setRevealed(0); }} title="Restart" style={btn}>
            ⏮
          </button>
          <button onClick={() => step(-1)} disabled={revealed === 0} title="Step back" style={btn}>
            ◀
          </button>
          <button
            onClick={() => (revealed >= total ? (setRevealed(0), setPlaying(true)) : setPlaying((p) => !p))}
            title={playing ? "Pause" : "Play"}
            style={{ ...btn, background: playing ? "var(--accent)" : "var(--bg-panel)", color: playing ? "var(--accent-contrast)" : "var(--text)" }}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button onClick={() => step(1)} disabled={revealed >= total} title="Step forward" style={btn}>
            ▶|
          </button>
          <button onClick={() => { setPlaying(false); setRevealed(total); }} title="Jump to latest" style={btn}>
            ⏭
          </button>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            title="Playback speed (events/sec)"
            style={{ ...btn, padding: "6px 8px" }}
          >
            {TIMELINE_SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
          <input
            type="range"
            min={0}
            max={total}
            value={revealed}
            aria-label="Position in project history"
            onChange={(e) => {
              setPlaying(false);
              setRevealed(Number(e.target.value));
            }}
            style={{ flex: 1, minWidth: 120, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 12, color: "var(--text)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
            {revealed} / {total}
          </span>
        </div>

        {/* Live Event Banner & Counts */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 10,
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
            {revealed === 0 ? (
              <span style={{ color: "var(--text-muted)" }}>
                ⏮ Timeline start · No beads created yet · Press ▶ to play or drag slider
              </span>
            ) : currentEvent ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    background: currentEvent.type === "created" ? "rgba(16, 185, 129, 0.2)" : "rgba(107, 114, 128, 0.25)",
                    color: currentEvent.type === "created" ? "#10b981" : "var(--text)",
                    border: `1px solid ${currentEvent.type === "created" ? "#10b981" : "#6b7280"}`,
                  }}
                >
                  {currentEvent.type === "created" ? "🟢 Created" : "🏁 Completed"}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text)" }}>
                  {shortId(currentEvent.beadId)}
                </span>
                <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {currentEvent.title}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: "auto" }}>
                  {formatEventTime(currentEvent.timestamp)}
                </span>
              </div>
            ) : null}
          </div>
          {timelineState && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, fontFamily: "var(--font-mono)" }}>
              <span style={{ color: "#10b981" }}>Created: {timelineState.createdCount}/{timelineState.totalBeads}</span>
              <span style={{ color: "#6b7280" }}>Completed: {timelineState.completedCount}/{timelineState.totalBeads}</span>
              <span style={{ color: "#3b82f6" }}>Active: {timelineState.activeCount}</span>
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: 16, color: "#ef4444", fontSize: 13 }}>Timeline failed: {error}</div>
        )}
        {!ordered && !error && (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Loading project history…
          </div>
        )}

        {/* Horizontal Sequence Ribbon */}
        {ordered && (
          <div style={{ overflowX: "auto", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", minWidth: "max-content" }}>
              {ordered.map((n, i) => {
                const nodeState = timelineState?.nodeStates.get(n.id);
                const isCreated = nodeState ? nodeState.created : false;
                const isCompleted = nodeState ? nodeState.completed : false;
                const isRevealed = i < revealed;
                const c = colorForStatus(n.status);
                const selected = n.id === selectedId;
                const isCurrent = nodeState?.isCurrentChange;
                return (
                  <div key={n.id} style={{ display: "flex", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 110 }}>
                      <button
                        onClick={() => isRevealed && openBead(n.id)}
                        disabled={!isRevealed}
                        title={isRevealed ? `${n.id}\n${n.title}\nStatus: ${nodeState?.effectiveStatus || n.status}` : "Not yet created at this tick"}
                        aria-label={`Bead ${n.id}`}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          border: `3px solid ${isCreated ? (selected || isCurrent ? "var(--accent)" : isCompleted ? "#6b7280" : c.stroke) : "var(--border)"}`,
                          background: isCreated ? (isCompleted ? "rgba(107, 114, 128, 0.3)" : c.fill) : "transparent",
                          opacity: isCreated ? 1 : 0.45,
                          cursor: isRevealed ? "pointer" : "default",
                          padding: 0,
                          boxShadow: isCurrent ? "0 0 0 3px rgba(245, 158, 11, 0.4)" : "none",
                        }}
                      />
                      <div
                        style={{
                          marginTop: 5,
                          fontSize: 10,
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          color: isCreated ? "var(--text)" : "var(--text-muted)",
                          opacity: isCreated ? 1 : 0.45,
                          textAlign: "center",
                          wordBreak: "break-all",
                        }}
                      >
                        {shortId(n.id)}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text-muted)", opacity: isCreated ? 1 : 0.45 }}>
                        {isCompleted ? "✓ closed" : timelineDateLabel(n.created_at)}
                      </div>
                    </div>
                    {i < ordered.length - 1 && (
                      <div
                        style={{
                          width: 18,
                          height: 3,
                          marginTop: 10,
                          background: isCreated ? "var(--accent)" : "var(--border)",
                          opacity: isCreated ? 1 : 0.4,
                          borderRadius: 2,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedId && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12,
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 12px",
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            <span>
              Selected: <strong style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{shortId(selectedId)}</strong>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#06b6d4", fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#06b6d4" }} />
              Incoming Prereqs ({layout?.edges.filter((e) => e.toId === selectedId).length || 0})
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#a855f7", fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#a855f7" }} />
              Outgoing Dependents ({layout?.edges.filter((e) => e.fromId === selectedId).length || 0})
            </span>
            <button
              onClick={() => {
                setSelectedId(null);
                setDetail({ loading: false, bead: null, error: null });
              }}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 12,
                textDecoration: "underline",
              }}
            >
              ✕ Clear Selection
            </button>
          </div>
        )}

        {/* Live Dynamic Dependency Graph reacting to each tick */}
        {layout && layout.nodes.length > 0 && (
          <GraphScrollContainer contentWidth={layout.width}>
            <svg width={layout.width} height={layout.height} role="img" aria-label="Beads dependency graph">
              <defs>
                <marker id="timeline-edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" />
                </marker>
                <marker id="timeline-edge-arrow-satisfied" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8" fill="none" stroke="var(--accent)" strokeWidth="1.8" />
                </marker>
                <marker id="timeline-edge-arrow-incoming" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                  <path d="M0,0.5 L8,4.5 L0,8.5" fill="#06b6d4" stroke="#06b6d4" strokeWidth="1.5" />
                </marker>
                <marker id="timeline-edge-arrow-outgoing" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                  <path d="M0,0.5 L8,4.5 L0,8.5" fill="#a855f7" stroke="#a855f7" strokeWidth="1.5" />
                </marker>
                <marker id="timeline-edge-arrow-dimmed" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8" fill="none" stroke="var(--border)" strokeWidth="1" opacity="0.3" />
                </marker>
              </defs>
              {sortedEdges.map((e) => {
                const fromState = timelineState?.nodeStates.get(e.fromId);
                const toState = timelineState?.nodeStates.get(e.toId);
                const bothCreated = (fromState?.created ?? true) && (toState?.created ?? true);
                const satisfied = fromState?.completed ?? false;

                const highlight = getEdgeHighlight(e, selectedId);
                const hasSelection = selectedId !== null;

                let strokeColor = "var(--text-muted)";
                let strokeWidth = 1.5;
                let strokeDash = undefined;
                let opacity = 1;
                let marker = "url(#timeline-edge-arrow)";

                if (hasSelection) {
                  if (highlight === "incoming") {
                    strokeColor = EDGE_HIGHLIGHT_COLORS.incoming.stroke;
                    strokeWidth = 2.8;
                    opacity = 1;
                    marker = "url(#timeline-edge-arrow-incoming)";
                  } else if (highlight === "outgoing") {
                    strokeColor = EDGE_HIGHLIGHT_COLORS.outgoing.stroke;
                    strokeWidth = 2.8;
                    opacity = 1;
                    marker = "url(#timeline-edge-arrow-outgoing)";
                  } else {
                    strokeColor = EDGE_HIGHLIGHT_COLORS.dimmed.stroke;
                    strokeWidth = 1;
                    opacity = EDGE_HIGHLIGHT_COLORS.dimmed.opacity;
                    marker = "url(#timeline-edge-arrow-dimmed)";
                  }
                } else {
                  if (!bothCreated) {
                    strokeColor = "var(--border)";
                    strokeDash = "3 3";
                    opacity = 0.2;
                    marker = "url(#timeline-edge-arrow-dimmed)";
                  } else if (satisfied) {
                    strokeColor = "var(--accent)";
                    strokeWidth = 2;
                    opacity = 0.85;
                    marker = "url(#timeline-edge-arrow-satisfied)";
                  } else {
                    strokeColor = "#f59e0b";
                    strokeDash = "4 2";
                    opacity = 0.75;
                  }
                }

                return (
                  <line
                    key={`${e.fromId}->${e.toId}`}
                    x1={e.x1}
                    y1={e.y1}
                    x2={e.x2 - 3}
                    y2={e.y2}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDash}
                    opacity={opacity}
                    markerEnd={marker}
                  />
                );
              })}
              {layout.nodes.map((n) => {
                const nodeState = timelineState?.nodeStates.get(n.id);
                const effStatus = nodeState?.effectiveStatus || n.status;
                const isCreated = nodeState ? nodeState.created : true;
                const isCompleted = nodeState ? nodeState.completed : effStatus === "closed";
                const isCurrent = nodeState?.isCurrentChange;
                const c = colorForStatus(effStatus);

                const isSelected = n.id === selectedId;
                const isIncomingNeighbor = selectedId !== null && layout.edges.some((e) => e.toId === selectedId && e.fromId === n.id);
                const isOutgoingNeighbor = selectedId !== null && layout.edges.some((e) => e.fromId === selectedId && e.toId === n.id);
                const isRelated = isSelected || isIncomingNeighbor || isOutgoingNeighbor;

                const nodeOpacity = selectedId !== null
                  ? (isRelated ? 1.0 : (!isCreated ? 0.2 : 0.4))
                  : (!isCreated ? 0.35 : 1.0);

                const strokeColor = isSelected
                  ? "var(--accent)"
                  : isIncomingNeighbor
                  ? "#06b6d4"
                  : isOutgoingNeighbor
                  ? "#a855f7"
                  : isCurrent
                  ? "#f59e0b"
                  : isCreated
                  ? (isCompleted ? "#6b7280" : c.stroke)
                  : "var(--border)";

                const strokeWidth = isSelected ? 3 : (isIncomingNeighbor || isOutgoingNeighbor || isCurrent ? 2.5 : (isCreated ? 2 : 1));

                return (
                  <g
                    key={n.id}
                    onClick={() => openBead(n.id)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    aria-label={`Bead ${n.id}`}
                  >
                    <title>{`${n.id}\n${n.title}\nStatus: ${effStatus}${isCurrent ? " (Changed this tick)" : ""}`}</title>
                    {/* Selected node focus ring */}
                    {isSelected && (
                      <rect
                        x={n.x - 4}
                        y={n.y - 4}
                        width={NODE_W + 8}
                        height={NODE_H + 8}
                        rx={12}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth={2.5}
                        opacity={0.85}
                        style={{ filter: "drop-shadow(0 0 6px var(--accent))" }}
                      />
                    )}
                    {isCurrent && (
                      <rect
                        x={n.x - 4}
                        y={n.y - 4}
                        width={NODE_W + 8}
                        height={NODE_H + 8}
                        rx={12}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        opacity={0.8}
                      />
                    )}
                    <rect
                      x={n.x}
                      y={n.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={8}
                      fill={isCreated ? (isCompleted ? "rgba(107, 114, 128, 0.16)" : c.fill) : "rgba(255, 255, 255, 0.02)"}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={isCreated ? undefined : "4 3"}
                      opacity={nodeOpacity}
                    />
                    <text
                      x={n.x + 10}
                      y={n.y + 18}
                      fontSize={11}
                      fontWeight={700}
                      fill="var(--text)"
                      fontFamily="var(--font-mono)"
                      opacity={nodeOpacity}
                    >
                      {shortId(n.id)}
                    </text>
                    <text
                      x={n.x + 10}
                      y={n.y + 34}
                      fontSize={11}
                      fill="var(--text-muted)"
                      opacity={nodeOpacity}
                    >
                      {n.title.length > 20 ? `${n.title.slice(0, 19)}…` : n.title}
                    </text>
                    {isCreated && (
                      <text
                        x={n.x + NODE_W - 10}
                        y={n.y + 18}
                        textAnchor="end"
                        fontSize={10}
                        fontWeight={600}
                        fill={isCompleted ? "#6b7280" : c.stroke}
                        opacity={nodeOpacity}
                      >
                        {isCompleted ? "✓ closed" : effStatus}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </GraphScrollContainer>
        )}
      </div>
      <BeadDetailPanel bead={detail.bead} loading={detail.loading} error={detail.error} />
    </div>
  );
}

const btn: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-panel)",
  color: "var(--text)",
  fontSize: 13,
  cursor: "pointer",
};
