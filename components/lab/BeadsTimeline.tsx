"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { BeadGraphNode, BeadItem } from "@/lib/lab-service";
import { colorForStatus } from "./beads-graph-layout";
import { TIMELINE_SPEEDS, orderBeadsForTimeline, timelineDateLabel } from "./beads-timeline";
import { BeadDetailPanel } from "./BeadDetailPanel";

interface Props {
  labPath: string;
}

interface DetailState {
  loading: boolean;
  bead: BeadItem | null;
  error: string | null;
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
          if (json.success && Array.isArray(json.data)) setNodes(json.data);
          else setError(json.error || "Failed to load beads timeline");
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
  const total = ordered?.length ?? 0;

  useEffect(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (playing && ordered && revealed < total) {
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
  }, [playing, speed, ordered, revealed, total]);

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

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
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
            style={btn}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button onClick={() => step(1)} disabled={revealed >= total} title="Step forward" style={btn}>
            ▶|
          </button>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            title="Playback speed (beads/sec)"
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
            style={{ flex: 1, minWidth: 120 }}
          />
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {revealed} / {total}
          </span>
        </div>
        {error && (
          <div style={{ padding: 16, color: "#ef4444", fontSize: 13 }}>Timeline failed: {error}</div>
        )}
        {!ordered && !error && (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Loading project history…
          </div>
        )}
        {ordered && (
          <div style={{ overflowX: "auto", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", minWidth: "max-content" }}>
              {ordered.map((n, i) => {
                const isRevealed = i < revealed;
                const c = colorForStatus(n.status);
                const selected = n.id === selectedId;
                return (
                  <div key={n.id} style={{ display: "flex", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 120 }}>
                      <button
                        onClick={() => isRevealed && openBead(n.id)}
                        disabled={!isRevealed}
                        title={isRevealed ? `${n.id}\n${n.title}` : "Not yet revealed — play or step forward"}
                        aria-label={`Bead ${n.id}`}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          border: `3px solid ${isRevealed ? (selected ? "var(--accent)" : c.stroke) : "var(--border)"}`,
                          background: isRevealed ? c.fill : "transparent",
                          opacity: isRevealed ? 1 : 0.45,
                          cursor: isRevealed ? "pointer" : "default",
                          padding: 0,
                        }}
                      />
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          color: isRevealed ? "var(--text)" : "var(--text-muted)",
                          opacity: isRevealed ? 1 : 0.45,
                          textAlign: "center",
                          wordBreak: "break-all",
                        }}
                      >
                        {n.id.replace("pi-research-lab-", "")}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", opacity: isRevealed ? 1 : 0.45 }}>
                        {timelineDateLabel(n.created_at)}
                      </div>
                    </div>
                    {i < ordered.length - 1 && (
                      <div
                        style={{
                          width: 24,
                          height: 3,
                          marginTop: 10,
                          background: i + 1 < revealed ? "var(--accent)" : "var(--border)",
                          opacity: i + 1 < revealed ? 1 : 0.5,
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
