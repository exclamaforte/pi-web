"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import type { LabOverviewItem, LabWorkerBubble, WorkerBubbleState } from "@/lib/lab-service";

interface Props {
  selectedLabPath: string | null;
  onSelectLab: (path: string, targetTab?: "workers" | "beads" | "gpu" | "experiments" | "logs") => void;
}

const BUBBLE_STYLES: Record<
  WorkerBubbleState,
  { bg: string; border: string; text: string; dot: string; label: string }
> = {
  working: {
    bg: "rgba(16, 185, 129, 0.16)",
    border: "rgba(16, 185, 129, 0.45)",
    text: "#10b981",
    dot: "#10b981",
    label: "Working",
  },
  parked: {
    bg: "rgba(168, 85, 247, 0.16)",
    border: "rgba(168, 85, 247, 0.45)",
    text: "#a855f7",
    dot: "#a855f7",
    label: "Parked",
  },
  idle: {
    bg: "rgba(59, 130, 246, 0.14)",
    border: "rgba(59, 130, 246, 0.35)",
    text: "#3b82f6",
    dot: "#3b82f6",
    label: "Idle",
  },
  held: {
    bg: "rgba(245, 158, 11, 0.16)",
    border: "rgba(245, 158, 11, 0.45)",
    text: "#f59e0b",
    dot: "#f59e0b",
    label: "Taken Over",
  },
  dead: {
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.28)",
    text: "#ef4444",
    dot: "#ef4444",
    label: "Down",
  },
};

export function LabsSummaryView({ selectedLabPath, onSelectLab }: Props) {
  const [labs, setLabs] = useState<LabOverviewItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "working" | "parked" | "active" | "stopped">("all");
  const [search, setSearch] = useState("");

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const res = await fetch("/api/lab/overview");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setLabs(json.data);
        setError(null);
      } else {
        setError(json.error || "Failed to load labs summary");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    const timer = setInterval(() => {
      loadOverview(true);
    }, 10000);
    return () => clearInterval(timer);
  }, [loadOverview]);

  // Aggregate stats across all labs
  const aggregateStats = useMemo(() => {
    if (!labs) return null;
    let totalLabs = labs.length;
    let activeLabs = 0;
    let workingWorkers = 0;
    let parkedWorkers = 0;
    let idleWorkers = 0;
    let deadWorkers = 0;
    let totalWorkers = 0;
    let gpuActiveCount = 0;

    for (const l of labs) {
      if (l.daemonAlive) activeLabs++;
      if (l.gpuActive) gpuActiveCount++;
      workingWorkers += l.counts.working;
      parkedWorkers += l.counts.parked;
      idleWorkers += l.counts.idle;
      deadWorkers += l.counts.dead;
      totalWorkers += l.counts.total;
    }

    return {
      totalLabs,
      activeLabs,
      stoppedLabs: totalLabs - activeLabs,
      workingWorkers,
      parkedWorkers,
      idleWorkers,
      deadWorkers,
      totalWorkers,
      gpuActiveCount,
    };
  }, [labs]);

  // Filtered labs
  const filteredLabs = useMemo(() => {
    if (!labs) return [];
    return labs.filter((lab) => {
      // Search query
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesName = lab.name.toLowerCase().includes(q);
        const matchesPath = lab.path.toLowerCase().includes(q);
        const matchesWorker = lab.workers.some((w) => w.role.toLowerCase().includes(q));
        if (!matchesName && !matchesPath && !matchesWorker) return false;
      }

      // Filter category
      if (filter === "working") return lab.counts.working > 0;
      if (filter === "parked") return lab.counts.parked > 0;
      if (filter === "active") return lab.daemonAlive;
      if (filter === "stopped") return !lab.daemonAlive;
      return true;
    });
  }, [labs, filter, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Top Aggregation Header Bar */}
      <div
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
              <span>🌐</span>
              <span>All Research Labs Overview</span>
              {aggregateStats && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                  }}
                >
                  {aggregateStats.activeLabs} / {aggregateStats.totalLabs} active
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              High-level overview of active workers, parked jobs, and daemon states across every lab.
            </div>
          </div>

          <button
            type="button"
            onClick={() => loadOverview(false)}
            disabled={refreshing}
            title="Refresh labs overview"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 6,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none" }}>
              🔄
            </span>
            <span>Refresh</span>
          </button>
        </div>

        {/* Global Status Bubbles Summary Cards */}
        {aggregateStats && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 10,
            }}
          >
            {/* Working bubble stat */}
            <div
              onClick={() => setFilter(filter === "working" ? "all" : "working")}
              style={{
                background: BUBBLE_STYLES.working.bg,
                border: `1px solid ${filter === "working" ? BUBBLE_STYLES.working.text : BUBBLE_STYLES.working.border}`,
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                userSelect: "none",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: BUBBLE_STYLES.working.text, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: BUBBLE_STYLES.working.dot, boxShadow: `0 0 6px ${BUBBLE_STYLES.working.dot}` }} />
                <span>Working</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: BUBBLE_STYLES.working.text, marginTop: 4 }}>
                {aggregateStats.workingWorkers}
              </div>
            </div>

            {/* Parked bubble stat */}
            <div
              onClick={() => setFilter(filter === "parked" ? "all" : "parked")}
              style={{
                background: BUBBLE_STYLES.parked.bg,
                border: `1px solid ${filter === "parked" ? BUBBLE_STYLES.parked.text : BUBBLE_STYLES.parked.border}`,
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                userSelect: "none",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: BUBBLE_STYLES.parked.text, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: BUBBLE_STYLES.parked.dot }} />
                <span>Parked</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: BUBBLE_STYLES.parked.text, marginTop: 4 }}>
                {aggregateStats.parkedWorkers}
              </div>
            </div>

            {/* Idle bubble stat */}
            <div
              style={{
                background: BUBBLE_STYLES.idle.bg,
                border: `1px solid ${BUBBLE_STYLES.idle.border}`,
                borderRadius: 8,
                padding: "8px 12px",
                userSelect: "none",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: BUBBLE_STYLES.idle.text, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: BUBBLE_STYLES.idle.dot }} />
                <span>Idle</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: BUBBLE_STYLES.idle.text, marginTop: 4 }}>
                {aggregateStats.idleWorkers}
              </div>
            </div>

            {/* Down / Inactive bubble stat */}
            <div
              onClick={() => setFilter(filter === "stopped" ? "all" : "stopped")}
              style={{
                background: BUBBLE_STYLES.dead.bg,
                border: `1px solid ${filter === "stopped" ? BUBBLE_STYLES.dead.text : BUBBLE_STYLES.dead.border}`,
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: BUBBLE_STYLES.dead.text, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: BUBBLE_STYLES.dead.dot }} />
                <span>Labs Down</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: BUBBLE_STYLES.dead.text, marginTop: 4 }}>
                {aggregateStats.stoppedLabs}
              </div>
            </div>
          </div>
        )}

        {/* Filter Chips and Search Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginRight: 2 }}>Filter:</span>
            {[
              { key: "all", label: `All (${labs?.length || 0})` },
              { key: "working", label: `🟢 Working (${aggregateStats?.workingWorkers || 0})` },
              { key: "parked", label: `🟣 Parked (${aggregateStats?.parkedWorkers || 0})` },
              { key: "active", label: `Active (${aggregateStats?.activeLabs || 0})` },
              { key: "stopped", label: `Stopped (${aggregateStats?.stoppedLabs || 0})` },
            ].map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key as any)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 14,
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    cursor: "pointer",
                    background: active ? "var(--accent)" : "var(--bg)",
                    color: active ? "var(--accent-contrast)" : "var(--text)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    transition: "all 0.15s ease",
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Search box */}
          <div style={{ position: "relative", minWidth: 180 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search labs or workers…"
              style={{
                width: "100%",
                padding: "5px 26px 5px 10px",
                borderRadius: 6,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontSize: 12,
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 6,
                  top: 5,
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && !labs && (
        <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "3px solid var(--border)",
              borderTopColor: "var(--accent)",
              animation: "spin 1s linear infinite",
              margin: "0 auto 12px auto",
            }}
          />
          Scanning lab daemons and worker states…
        </div>
      )}

      {/* Error state */}
      {error && !labs && (
        <div style={{ padding: 20, background: "rgba(239, 68, 68, 0.12)", color: "#ef4444", borderRadius: 8, fontSize: 13 }}>
          Failed to load summary: {error}
        </div>
      )}

      {/* Labs Overview Grid */}
      {labs && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 14,
          }}
        >
          {filteredLabs.length === 0 ? (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: 40,
                textAlign: "center",
                color: "var(--text-muted)",
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 10,
              }}
            >
              No labs match the current filter or search.
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setFilter("all");
                    setSearch("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontSize: 12,
                  }}
                >
                  Reset filters
                </button>
              </div>
            </div>
          ) : (
            filteredLabs.map((lab) => {
              const isSelected = selectedLabPath === lab.path;

              return (
                <div
                  key={lab.path}
                  onClick={() => onSelectLab(lab.path, "workers")}
                  style={{
                    background: "var(--bg-panel)",
                    border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: 10,
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    cursor: "pointer",
                    transition: "transform 0.1s ease, border-color 0.15s ease",
                    boxShadow: isSelected ? "0 0 10px rgba(var(--accent-rgb, 36, 91, 206), 0.2)" : "none",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 16 }}>🧪</span>
                        <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {lab.name}
                        </span>
                        {isSelected && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "var(--accent)",
                              color: "var(--accent-contrast)",
                            }}
                          >
                            Selected
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginTop: 2,
                        }}
                        title={lab.path}
                      >
                        {lab.path}
                      </div>
                    </div>

                    {/* Daemon & GPU Badges */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 12,
                          background: lab.daemonAlive ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.12)",
                          color: lab.daemonAlive ? "#10b981" : "#ef4444",
                          border: `1px solid ${lab.daemonAlive ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.25)"}`,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: lab.daemonAlive ? "#10b981" : "#ef4444" }} />
                        {lab.daemonAlive ? `Active (PID ${lab.pid || "?"})` : "Stopped"}
                      </span>

                      {lab.gpuActive && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 10,
                            background: "rgba(245, 158, 11, 0.18)",
                            color: "#f59e0b",
                            border: "1px solid rgba(245, 158, 11, 0.4)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          ⚡ GPU Busy
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Worker Status Bubbles */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
                      Workers Status:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {lab.workers.length === 0 ? (
                        <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                          No workers configured
                        </span>
                      ) : (
                        lab.workers.map((w) => {
                          const style = BUBBLE_STYLES[w.state] ?? BUBBLE_STYLES.idle;
                          return (
                            <div
                              key={w.role}
                              title={`${w.role} (${w.sessionId || ""})${w.model ? ` · ${w.model}` : ""}: ${style.label}`}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "4px 10px",
                                borderRadius: 16,
                                background: style.bg,
                                border: `1px solid ${style.border}`,
                                color: style.text,
                                fontSize: 12,
                                fontWeight: 600,
                                userSelect: "none",
                              }}
                            >
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: "50%",
                                  background: style.dot,
                                  boxShadow: w.state === "working" ? `0 0 6px ${style.dot}` : "none",
                                }}
                              />
                              <span style={{ textTransform: "capitalize" }}>{w.role}:</span>
                              <span style={{ fontWeight: 500 }}>{style.label}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Footer / Quick Action */}
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: 10,
                      marginTop: "auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: "var(--text-muted)",
                    }}
                  >
                    <span>
                      {lab.counts.working > 0 && <strong style={{ color: "#10b981" }}>{lab.counts.working} working · </strong>}
                      {lab.counts.parked > 0 && <strong style={{ color: "#a855f7" }}>{lab.counts.parked} parked · </strong>}
                      <span>{lab.counts.idle} idle</span>
                    </span>

                    <span
                      style={{
                        color: "var(--accent)",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      Open Lab →
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
