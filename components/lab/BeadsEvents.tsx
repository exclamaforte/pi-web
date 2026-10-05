"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import type { BeadEventsResult, BeadEventRecord } from "@/lib/lab-service";

interface Props {
  labPath: string;
}

const OP_COLORS: Record<string, { bg: string; text: string }> = {
  create: { bg: "rgba(16, 185, 129, 0.15)", text: "#10b981" },
  update: { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6" },
  close: { bg: "rgba(107, 114, 128, 0.18)", text: "#9ca3af" },
  comment: { bg: "rgba(168, 85, 247, 0.15)", text: "#a855f7" },
  dep_add: { bg: "rgba(6, 182, 212, 0.15)", text: "#06b6d4" },
  dep_remove: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444" },
  claim: { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b" },
};

function formatEventTime(isoString?: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export function BeadsEvents({ labPath }: Props) {
  const [data, setData] = useState<BeadEventsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOp, setSelectedOp] = useState<string>("all");
  const [copiedConfig, setCopiedConfig] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lab/beads?path=${encodeURIComponent(labPath)}&view=events&limit=100`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || "Failed to load events");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [labPath]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const filteredRecords = useMemo(() => {
    if (!data?.records) return [];
    if (selectedOp === "all") return data.records;
    return data.records.filter((r) => r.op === selectedOp);
  }, [data, selectedOp]);

  const handleCopyConfig = () => {
    navigator.clipboard.writeText("bd config set events-journal true");
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Overview Banner */}
      <div
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>📜</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Durable Events Journal</span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 12,
                background: "rgba(6, 182, 212, 0.15)",
                color: "#06b6d4",
                fontWeight: 600,
              }}
            >
              bd events
            </span>
          </div>
          <button
            onClick={loadEvents}
            disabled={loading}
            style={{
              background: "var(--bg-hover)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: 12,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Refreshing…" : "🔄 Refresh"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
          An append-only, replayable ledger recording issue mutations committed on this workspace (creates, updates, closures, dependencies, claims, comments).
        </div>
      </div>

      {/* Disabled Notification */}
      {data && !data.enabled && (
        <div
          style={{
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            borderRadius: 8,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600, color: "#f59e0b", display: "flex", alignItems: "center", gap: 6 }}>
            <span>ℹ️</span> Events journal is currently inactive for this workspace
          </div>
          <div style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
            To enable automatic mutation journaling across all future beads changes, run:
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <code
              style={{
                fontFamily: "var(--font-mono)",
                background: "var(--bg)",
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                fontSize: 11,
              }}
            >
              bd config set events-journal true
            </code>
            <button
              onClick={handleCopyConfig}
              style={{
                background: "var(--bg-hover)",
                color: copiedConfig ? "#10b981" : "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "3px 8px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {copiedConfig ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Filter by op */}
      {data && data.records.length > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {["all", "create", "update", "close", "claim", "comment", "dep_add", "dep_remove"].map((op) => {
            const isSelected = selectedOp === op;
            return (
              <button
                key={op}
                onClick={() => setSelectedOp(op)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 14,
                  fontSize: 11,
                  fontWeight: isSelected ? 600 : 500,
                  border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: isSelected ? "var(--accent)" : "var(--bg-panel)",
                  color: isSelected ? "var(--accent-contrast)" : "var(--text)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {op}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading & Error */}
      {loading && (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Loading events journal…
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: 14, background: "rgba(239, 68, 68, 0.12)", color: "#ef4444", borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && filteredRecords.length === 0 && (
        <div
          style={{
            padding: 36,
            textAlign: "center",
            background: "var(--bg-panel)",
            border: "1px dashed var(--border)",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 24 }}>📜</span>
          <div style={{ fontWeight: 600, fontSize: 14 }}>No journal events found</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 360, lineHeight: 1.5 }}>
            {selectedOp !== "all"
              ? `No events with operation "${selectedOp}".`
              : "No mutation events recorded yet. Enable the events journal or make changes to generate entries."}
          </div>
        </div>
      )}

      {/* Events List */}
      {!loading && !error && filteredRecords.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredRecords.map((r: BeadEventRecord) => {
            const opStyle = OP_COLORS[r.op] || { bg: "var(--bg-hover)", text: "var(--text)" };
            return (
              <div
                key={`${r.seq}-${r.ts}`}
                style={{
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--text-muted)",
                        background: "var(--bg-hover)",
                        padding: "1px 5px",
                        borderRadius: 3,
                      }}
                    >
                      #{r.seq}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: 10,
                        background: opStyle.bg,
                        color: opStyle.text,
                        textTransform: "uppercase",
                      }}
                    >
                      {r.op}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--accent)",
                      }}
                    >
                      {r.issue_id}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 8 }}>
                    {r.actor && <span>by <strong>{r.actor}</strong></span>}
                    <span>{formatEventTime(r.ts)}</span>
                  </div>
                </div>

                {/* Event details payload */}
                {r.issue?.title && (
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                    {r.issue.title}
                  </div>
                )}
                {r.comment?.text && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", whiteSpace: "pre-wrap" }}>
                    &ldquo;{r.comment.text}&rdquo;
                  </div>
                )}
                {r.dep && (
                  <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                    Target: {r.dep.target} ({r.dep.kind || "dependency"})
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
