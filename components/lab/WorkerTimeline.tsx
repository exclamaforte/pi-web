"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkerTimelineSample } from "@/lib/lab-service";

interface Props {
  labPath: string | null;
}

const MAX_COLS = 240;

type CellState = "dead" | "held" | "busy" | "parked" | "offline" | "idle";

const STATE_COLORS: Record<CellState, string> = {
  dead: "#ef4444",
  held: "#f59e0b",
  busy: "#10b981",
  parked: "#a855f7",
  offline: "#6b7280",
  idle: "#3b82f6",
};

const STATE_LABELS: Record<CellState, string> = {
  dead: "dead",
  held: "taken over",
  busy: "busy",
  parked: "parked",
  offline: "bridge down",
  idle: "idle",
};

function cellStateOf(s: WorkerTimelineSample["workers"][string]): CellState {
  if (!s.alive) return "dead";
  if (s.held) return "held";
  if (s.busy) return "busy";
  if (s.parked) return "parked";
  if (!s.connected) return "offline";
  return "idle";
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WorkerTimeline({ labPath }: Props) {
  const [samples, setSamples] = useState<WorkerTimelineSample[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!labPath) {
      setSamples([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async (silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/lab/timeline?path=${encodeURIComponent(labPath)}`);
        const json = await res.json();
        if (!cancelled && json.success && Array.isArray(json.data)) {
          setSamples(json.data);
        }
      } catch {
        // keep previous samples
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load(false);
    const interval = setInterval(() => load(true), 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [labPath]);

  const roles = useMemo(() => {
    const set = new Set<string>();
    for (const s of samples) for (const r of Object.keys(s.workers)) set.add(r);
    return ["pi", "implementer", "reviewer"].filter((r) => set.has(r))
      .concat([...set].filter((r) => !["pi", "implementer", "reviewer"].includes(r)).sort());
  }, [samples]);

  const columns = useMemo(() => {
    if (samples.length <= MAX_COLS) return samples.map((s) => [s]);
    const out: WorkerTimelineSample[][] = [];
    const size = samples.length / MAX_COLS;
    for (let i = 0; i < MAX_COLS; i++) {
      out.push(samples.slice(Math.floor(i * size), Math.floor((i + 1) * size)));
    }
    return out.filter((b) => b.length > 0);
  }, [samples]);

  const stats = useMemo(() => {
    const out: Record<string, Record<CellState, number>> = {};
    for (const r of roles) {
      out[r] = { dead: 0, held: 0, busy: 0, parked: 0, offline: 0, idle: 0 };
      for (const s of samples) {
        const w = s.workers[r];
        if (!w) continue;
        out[r][cellStateOf(w)] += 1;
      }
    }
    return out;
  }, [roles, samples]);

  if (loading && samples.length === 0) {
    return <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading timeline…</div>;
  }

  if (samples.length === 0) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No timeline samples yet. The daemon writes one per poll tick to <span style={{ fontFamily: "var(--font-mono)" }}>.lab/worker-timeline.jsonl</span> —
        restart labd (<span style={{ fontFamily: "var(--font-mono)" }}>lab stop &amp;&amp; lab spawn</span>) to begin sampling.
      </div>
    );
  }

  const firstTs = samples[0].ts;
  const lastTs = samples[samples.length - 1].ts;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Worker status timeline</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {samples.length} samples · {fmtTime(firstTs)} → {fmtTime(lastTs)} · one sample per labd tick
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, color: "var(--text-muted)" }}>
        {(Object.keys(STATE_COLORS) as CellState[]).map((s) => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: STATE_COLORS[s], display: "inline-block" }} />
            {STATE_LABELS[s]}
          </span>
        ))}
      </div>

      {roles.map((role) => (
        <div key={role} style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 13, textTransform: "capitalize" }}>{role}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {(Object.keys(STATE_COLORS) as CellState[])
                .map((s) => {
                  const n = stats[role][s];
                  if (!n) return null;
                  const pct = Math.round((100 * n) / samples.length);
                  return `${STATE_LABELS[s]} ${pct}%`;
                })
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 1, height: 26 }}>
            {columns.map((bucket, i) => {
              const last = bucket[bucket.length - 1];
              const w = last.workers[role];
              if (!w) return <div key={i} style={{ flex: 1, background: "transparent" }} />;
              const st = cellStateOf(w);
              const tip = `${role} · ${STATE_LABELS[st]} · ${fmtTime(bucket[0].ts)}`
                + (w.parked && w.parkedOn.length > 0 ? `\nparked on: ${w.parkedOn.join("; ")}` : "")
                + (w.pending > 0 ? `\npending wakes: ${w.pending}` : "")
                + (w.restarts > 0 ? `\nrestarts: ${w.restarts}` : "");
              return <div key={i} title={tip} style={{ flex: 1, background: STATE_COLORS[st], borderRadius: 1, minWidth: 1 }} />;
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            <span>{fmtTime(firstTs)}</span>
            <span>{fmtTime(lastTs)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
