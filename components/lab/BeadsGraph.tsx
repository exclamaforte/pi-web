"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { BeadGraphNode, BeadItem } from "@/lib/lab-service";
import {
  NODE_W,
  NODE_H,
  colorForStatus,
  layoutBeadGraph,
} from "./beads-graph-layout";
import {
  TIMELINE_SPEEDS,
  buildTimelineEvents,
  formatEventTime,
  getTimelineGraphState,
} from "./beads-timeline";
import { BeadDetailPanel } from "./BeadDetailPanel";

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

  // Timeline scrubber controls
  const [timelineActive, setTimelineActive] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNodes(null);
    setError(null);
    setSelectedId(null);
    setDetail({ loading: false, bead: null, error: null });
    setTimelineActive(false);
    setRevealed(0);
    setPlaying(false);
    fetch(`/api/lab/beads?path=${encodeURIComponent(labPath)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!cancelled) {
          if (json.success && Array.isArray(json.data)) {
            setNodes(json.data);
            const events = buildTimelineEvents(json.data);
            setRevealed(events.length);
          } else {
            setError(json.error || "Failed to load beads graph");
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

  const layout = useMemo(() => (nodes ? layoutBeadGraph(nodes) : null), [nodes]);
  const events = useMemo(() => (nodes ? buildTimelineEvents(nodes) : []), [nodes]);
  const total = events.length;

  const timelineState = useMemo(
    () => (nodes && events.length > 0 && timelineActive ? getTimelineGraphState(nodes, events, revealed) : null),
    [nodes, events, revealed, timelineActive]
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
    setTimelineActive(true);
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
        {/* Legend and Timeline Mode Toggle */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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
          {total > 0 && (
            <button
              onClick={() => {
                setTimelineActive((a) => !a);
                if (!timelineActive) setRevealed(total);
              }}
              style={{
                ...btn,
                fontSize: 12,
                padding: "4px 10px",
                background: timelineActive ? "var(--accent)" : "var(--bg-panel)",
                color: timelineActive ? "var(--accent-contrast)" : "var(--text)",
                borderColor: timelineActive ? "var(--accent)" : "var(--border)",
              }}
            >
              {timelineActive ? "⏳ Timeline Mode ON" : "⏳ Scrub Timeline"}
            </button>
          )}
        </div>

        {/* Timeline Scrubber Bar when active */}
        {timelineActive && total > 0 && (
          <div
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
                style={{ ...btn, padding: "5px 8px" }}
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

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, flexWrap: "wrap", gap: 8 }}>
              {revealed === 0 ? (
                <span style={{ color: "var(--text-muted)" }}>
                  ⏮ Beginning · No beads created yet · Press ▶ to play
                </span>
              ) : currentEvent ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span
                    style={{
                      padding: "2px 6px",
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      background: currentEvent.type === "created" ? "rgba(16, 185, 129, 0.2)" : "rgba(107, 114, 128, 0.25)",
                      color: currentEvent.type === "created" ? "#10b981" : "var(--text)",
                      border: `1px solid ${currentEvent.type === "created" ? "#10b981" : "#6b7280"}`,
                    }}
                  >
                    {currentEvent.type === "created" ? "🟢 Created" : "🏁 Completed"}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{shortId(currentEvent.beadId)}</span>
                  <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{currentEvent.title}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 8 }}>{formatEventTime(currentEvent.timestamp)}</span>
                </div>
              ) : null}
              {timelineState && (
                <div style={{ display: "flex", gap: 8, fontSize: 11, fontFamily: "var(--font-mono)", marginLeft: "auto" }}>
                  <span style={{ color: "#10b981" }}>Created: {timelineState.createdCount}/{timelineState.totalBeads}</span>
                  <span style={{ color: "#6b7280" }}>Completed: {timelineState.completedCount}/{timelineState.totalBeads}</span>
                  <span style={{ color: "#3b82f6" }}>Active: {timelineState.activeCount}</span>
                </div>
              )}
            </div>
          </div>
        )}

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
                <marker id="bead-edge-arrow-satisfied" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8" fill="none" stroke="var(--accent)" strokeWidth="1.8" />
                </marker>
              </defs>
              {layout.edges.map((e) => {
                const fromState = timelineState?.nodeStates.get(e.fromId);
                const toState = timelineState?.nodeStates.get(e.toId);
                const bothCreated = timelineActive ? ((fromState?.created ?? true) && (toState?.created ?? true)) : true;
                const satisfied = timelineActive ? (fromState?.completed ?? false) : false;

                let strokeColor = "var(--text-muted)";
                let strokeWidth = 1.5;
                let strokeDash = undefined;
                let opacity = 1;
                let marker = "url(#bead-edge-arrow)";

                if (timelineActive) {
                  if (!bothCreated) {
                    strokeColor = "var(--border)";
                    strokeDash = "3 3";
                    opacity = 0.2;
                  } else if (satisfied) {
                    strokeColor = "var(--accent)";
                    strokeWidth = 2;
                    opacity = 0.85;
                    marker = "url(#bead-edge-arrow-satisfied)";
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
                    markerEnd="url(#bead-edge-arrow)"
                  />
                );
              })}
              {layout.nodes.map((n) => {
                const nodeState = timelineState?.nodeStates.get(n.id);
                const effStatus = timelineActive && nodeState ? nodeState.effectiveStatus : n.status;
                const isCreated = timelineActive && nodeState ? nodeState.created : true;
                const isCompleted = timelineActive && nodeState ? nodeState.completed : effStatus === "closed";
                const isCurrent = timelineActive && nodeState?.isCurrentChange;
                const c = colorForStatus(n.status);
                const effColor = colorForStatus(effStatus);
                const selected = n.id === selectedId;

                return (
                  <g
                    key={n.id}
                    onClick={() => openBead(n.id)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    aria-label={`Bead ${n.id}`}
                  >
                    <title>{`${n.id}\n${n.title}\nStatus: ${effStatus}`}</title>
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
                      fill={timelineActive ? (isCreated ? (isCompleted ? "rgba(107, 114, 128, 0.16)" : effColor.fill) : "rgba(255, 255, 255, 0.02)") : c.fill}
                      stroke={selected ? "var(--accent)" : isCurrent ? "#f59e0b" : timelineActive ? (isCreated ? (isCompleted ? "#6b7280" : effColor.stroke) : "var(--border)") : c.stroke}
                      strokeWidth={selected || isCurrent ? 3 : isCreated ? 2 : 1}
                      strokeDasharray={timelineActive && !isCreated ? "4 3" : undefined}
                      opacity={timelineActive && !isCreated ? 0.35 : 1}
                    />
                    <text
                      x={n.x + 10}
                      y={n.y + 18}
                      fontSize={11}
                      fontWeight={700}
                      fill="var(--text)"
                      fontFamily="var(--font-mono)"
                      opacity={timelineActive && !isCreated ? 0.45 : 1}
                    >
                      {shortId(n.id)}
                    </text>
                    <text
                      x={n.x + 10}
                      y={n.y + 34}
                      fontSize={11}
                      fill="var(--text-muted)"
                      opacity={timelineActive && !isCreated ? 0.45 : 1}
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
                        fill={isCompleted ? "#6b7280" : effColor.stroke}
                      >
                        {isCompleted ? "✓ closed" : effStatus}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
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
