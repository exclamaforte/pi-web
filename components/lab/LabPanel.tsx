"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import type { LabSummary, LabFullStatus, BeadItem, GpuJob, ExperimentSummary } from "@/lib/lab-service";
import { BeadsGraph } from "./BeadsGraph";
import { BeadsTimeline } from "./BeadsTimeline";
import { useIsMobile } from "@/hooks/useIsMobile";

interface Props {
  currentCwd: string | null;
  onClose: () => void;
  onOpenSession?: (cwd: string, sessionId: string) => void;
}

type TabKey = "workers" | "beads" | "gpu" | "experiments" | "logs";
type BeadsFilter = "ready" | "needsReview" | "needsReproduce" | "returned";

export function LabPanel({ currentCwd, onClose, onOpenSession }: Props) {
  const isMobile = useIsMobile();
  const [labs, setLabs] = useState<LabSummary[]>([]);
  const [selectedLabPath, setSelectedLabPath] = useState<string | null>(null);
  const [status, setStatus] = useState<LabFullStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("workers");
  const [beadsFilter, setBeadsFilter] = useState<BeadsFilter>("ready");
  const [beadsView, setBeadsView] = useState<"list" | "graph" | "timeline">("list");

  // Modals state
  const [steerModalRole, setSteerModalRole] = useState<string | null>(null);
  const [steerMessage, setSteerMessage] = useState("");
  const [sendModalRole, setSendModalRole] = useState<string | null>(null);
  const [sendMessage, setSendMessage] = useState("");
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Selected item modals
  const [selectedBead, setSelectedBead] = useState<BeadItem | null>(null);
  const [beadCommentText, setBeadCommentText] = useState("");
  const [viewGpuJob, setViewGpuJob] = useState<GpuJob | null>(null);
  const [gpuJobLogs, setGpuJobLogs] = useState<string | null>(null);
  const [loadingGpuLogs, setLoadingGpuLogs] = useState(false);
  const [viewExperiment, setViewExperiment] = useState<ExperimentSummary | null>(null);
  const [experimentDetails, setExperimentDetails] = useState<any | null>(null);
  const [loadingExperiment, setLoadingExperiment] = useState(false);

  // Load labs list
  const loadLabs = useCallback(async () => {
    try {
      const res = await fetch(`/api/lab/list${currentCwd ? `?path=${encodeURIComponent(currentCwd)}` : ""}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setLabs(json.data);
        if (!selectedLabPath && json.data.length > 0) {
          // Prefer currentCwd if it is a lab, or the first active lab, or the first lab
          const matchCwd = json.data.find((l: LabSummary) => l.path === currentCwd);
          const matchActive = json.data.find((l: LabSummary) => l.daemonAlive);
          setSelectedLabPath(matchCwd?.path || matchActive?.path || json.data[0].path);
        }
      }
    } catch (e) {
      console.error("Failed to load labs", e);
    }
  }, [currentCwd, selectedLabPath]);

  // Load status for selected lab
  const loadStatus = useCallback(async (path: string, silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const res = await fetch(`/api/lab/status?path=${encodeURIComponent(path)}`);
      const json = await res.json();
      if (json.success) {
        setStatus(json.data);
      }
    } catch (e) {
      console.error("Failed to load lab status", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadLabs();
  }, [loadLabs]);

  useEffect(() => {
    if (selectedLabPath) {
      loadStatus(selectedLabPath);
      // Auto-poll status every 10 seconds while panel is open
      const interval = setInterval(() => {
        loadStatus(selectedLabPath, true);
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [selectedLabPath, loadStatus]);

  // Handle Steer action
  const handleSteerSubmit = async () => {
    if (!selectedLabPath || !steerModalRole || !steerMessage.trim()) return;
    setActionInProgress(true);
    try {
      const res = await fetch("/api/lab/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "steer",
          path: selectedLabPath,
          role: steerModalRole,
          message: steerMessage.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionFeedback(`Steered ${steerModalRole} successfully`);
        setSteerModalRole(null);
        setSteerMessage("");
        loadStatus(selectedLabPath, true);
      } else {
        setActionFeedback(`Steer failed: ${json.error || "Unknown error"}`);
      }
    } catch (e) {
      setActionFeedback(`Steer failed: ${String(e)}`);
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Handle Send to Inbox action
  const handleSendSubmit = async () => {
    if (!selectedLabPath || !sendModalRole || !sendMessage.trim()) return;
    setActionInProgress(true);
    try {
      const res = await fetch("/api/lab/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          path: selectedLabPath,
          role: sendModalRole,
          message: sendMessage.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionFeedback(`Message sent to ${sendModalRole}'s inbox`);
        setSendModalRole(null);
        setSendMessage("");
        loadStatus(selectedLabPath, true);
      } else {
        setActionFeedback(`Send failed: ${json.error || "Unknown error"}`);
      }
    } catch (e) {
      setActionFeedback(`Send failed: ${String(e)}`);
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Handle Restart Role action
  const handleRestartRole = async (role: string) => {
    if (!selectedLabPath) return;
    setActionInProgress(true);
    try {
      const res = await fetch("/api/lab/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restart",
          path: selectedLabPath,
          roles: [role],
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionFeedback(`Restarted ${role}`);
        loadStatus(selectedLabPath, true);
      }
    } catch (e) {
      setActionFeedback(`Restart failed: ${String(e)}`);
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Handle Spawn Lab action
  const handleSpawnLab = async () => {
    if (!selectedLabPath) return;
    setActionInProgress(true);
    try {
      const res = await fetch("/api/lab/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "spawn",
          path: selectedLabPath,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionFeedback("Lab spawned");
        loadStatus(selectedLabPath, true);
      } else {
        setActionFeedback(`Spawn failed: ${json.error || "Unknown error"}`);
      }
    } catch (e) {
      setActionFeedback(`Spawn failed: ${String(e)}`);
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Handle Stop Lab action
  const handleStopLab = async () => {
    if (!selectedLabPath) return;
    if (!confirm("Are you sure you want to stop the lab daemon and workers?")) return;
    setActionInProgress(true);
    try {
      const res = await fetch("/api/lab/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stop",
          path: selectedLabPath,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionFeedback("Lab stopped");
        loadStatus(selectedLabPath, true);
      }
    } catch (e) {
      setActionFeedback(`Stop failed: ${String(e)}`);
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Handle Approve GPU Reproduce
  const handleApproveReproduce = async (bdId: string) => {
    if (!selectedLabPath) return;
    setActionInProgress(true);
    try {
      const res = await fetch("/api/lab/beads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve-reproduce",
          path: selectedLabPath,
          bdId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionFeedback(`GPU reproduce approved for ${bdId}`);
        loadStatus(selectedLabPath, true);
        if (selectedBead?.id === bdId) {
          setSelectedBead(null);
        }
      }
    } catch (e) {
      setActionFeedback(`Approval failed: ${String(e)}`);
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Handle Add Comment to Bead
  const handleAddComment = async (bdId: string) => {
    if (!selectedLabPath || !beadCommentText.trim()) return;
    setActionInProgress(true);
    try {
      const res = await fetch("/api/lab/beads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comment",
          path: selectedLabPath,
          bdId,
          message: beadCommentText.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionFeedback("Comment posted");
        setBeadCommentText("");
        loadStatus(selectedLabPath, true);
      }
    } catch (e) {
      setActionFeedback(`Comment failed: ${String(e)}`);
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Open GPU job logs
  const handleOpenGpuLogs = async (job: GpuJob) => {
    setViewGpuJob(job);
    setLoadingGpuLogs(true);
    try {
      const res = await fetch(`/api/lab/gpu?jobId=${encodeURIComponent(job.id)}`);
      const json = await res.json();
      if (json.success) {
        setGpuJobLogs(json.data.logs);
      }
    } catch {
      setGpuJobLogs("Failed to load logs");
    } finally {
      setLoadingGpuLogs(false);
    }
  };

  // Cancel GPU job
  const handleCancelGpuJob = async (jobId: string) => {
    if (!confirm(`Cancel GPU job ${jobId}?`)) return;
    setActionInProgress(true);
    try {
      const res = await fetch("/api/lab/gpu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action: "cancel" }),
      });
      const json = await res.json();
      if (json.success) {
        setActionFeedback(`Canceled job ${jobId}`);
        if (selectedLabPath) loadStatus(selectedLabPath, true);
        if (viewGpuJob?.id === jobId) setViewGpuJob(null);
      }
    } catch (e) {
      setActionFeedback(`Cancel failed: ${String(e)}`);
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Open Experiment Details
  const handleOpenExperiment = async (exp: ExperimentSummary) => {
    if (!selectedLabPath) return;
    setViewExperiment(exp);
    setLoadingExperiment(true);
    try {
      const res = await fetch(`/api/lab/experiments?path=${encodeURIComponent(selectedLabPath)}&id=${encodeURIComponent(exp.id)}`);
      const json = await res.json();
      if (json.success) {
        setExperimentDetails(json.data);
      }
    } catch {
      setExperimentDetails(null);
    } finally {
      setLoadingExperiment(false);
    }
  };

  const filteredBeads = useMemo(() => {
    if (!status?.beads) return [];
    return status.beads[beadsFilter] || [];
  }, [status, beadsFilter]);

  return (
    <div
      role="dialog"
      aria-label="Lab Management"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Top Header Bar */}
      <div
        className="lab-panel-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "max(12px, env(safe-area-inset-top))",
          paddingRight: isMobile ? "max(14px, env(safe-area-inset-right))" : "20px",
          paddingBottom: isMobile ? "10px" : "12px",
          paddingLeft: isMobile ? "max(14px, env(safe-area-inset-left))" : "20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 20 }}>🧪</span>
          {/* Lab Selector Dropdown */}
          <select
            value={selectedLabPath || ""}
            onChange={(e) => setSelectedLabPath(e.target.value)}
            style={{
              fontWeight: 600,
              fontSize: isMobile ? 14 : 16,
              background: "var(--bg)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 8px",
              maxWidth: isMobile ? 160 : 260,
              cursor: "pointer",
            }}
          >
            {labs.map((l) => (
              <option key={l.path} value={l.path}>
                {l.name} {l.daemonAlive ? "● (active)" : ""}
              </option>
            ))}
          </select>

          {/* Daemon Status Badge */}
          {status && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 8px",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 500,
                background: status.daemon.alive ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                color: status.daemon.alive ? "#10b981" : "#ef4444",
                whiteSpace: "nowrap",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: status.daemon.alive ? "#10b981" : "#ef4444",
                  boxShadow: status.daemon.alive ? "0 0 6px #10b981" : "none",
                }}
              />
              <span>{status.daemon.alive ? `labd (pid ${status.daemon.pid})` : "labd down"}</span>
            </div>
          )}
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {status && !status.daemon.alive && (
            <button
              onClick={handleSpawnLab}
              disabled={actionInProgress}
              style={{
                background: "var(--accent)",
                color: "var(--accent-contrast)",
                border: "none",
                borderRadius: 6,
                padding: isMobile ? "6px 10px" : "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              🚀 Spawn Lab
            </button>
          )}

          {status && status.daemon.alive && (
            <>
              <button
                onClick={() => handleRestartRole("")}
                disabled={actionInProgress}
                title="Restart all workers"
                style={{
                  background: "var(--bg-hover)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: isMobile ? "6px 8px" : "6px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                  display: isMobile ? "none" : "block",
                }}
              >
                🔄 Restart All
              </button>
              <button
                onClick={handleStopLab}
                disabled={actionInProgress}
                title="Stop lab daemon"
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#ef4444",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 6,
                  padding: isMobile ? "6px 8px" : "6px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                🛑 Stop
              </button>
            </>
          )}

          <button
            onClick={() => selectedLabPath && loadStatus(selectedLabPath)}
            disabled={refreshing}
            title="Refresh status"
            style={{
              background: "none",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              borderRadius: 6,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            🔄
          </button>

          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              color: "var(--text)",
              fontSize: 20,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionFeedback && (
        <div
          style={{
            padding: "8px 16px",
            background: "var(--accent)",
            color: "var(--accent-contrast)",
            fontSize: 13,
            fontWeight: 500,
            textAlign: "center",
          }}
        >
          {actionFeedback}
        </div>
      )}

      {/* Tab Navigation */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {[
          { key: "workers", label: "👥 Workers", count: status ? Object.keys(status.workers).length : undefined },
          { key: "beads", label: "📋 Beads", count: status ? (status.beads.readyCount + status.beads.needsReviewCount + status.beads.needsReproduceCount) : undefined },
          { key: "gpu", label: "⚡ GPU Queue", count: status?.gpuQueue?.running?.length ? `${status.gpuQueue.running.length} run` : undefined },
          { key: "experiments", label: "🔬 Experiments", count: status?.experiments?.length },
          { key: "logs", label: "📜 Logs & Inboxes" },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              style={{
                flex: isMobile ? 1 : "initial",
                padding: isMobile ? "10px 8px" : "12px 20px",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                background: isActive ? "var(--bg)" : "transparent",
                color: isActive ? "var(--text)" : "var(--text-muted)",
                fontWeight: isActive ? 600 : 500,
                fontSize: isMobile ? 12 : 13,
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 10,
                    background: isActive ? "var(--accent)" : "var(--bg-hover)",
                    color: isActive ? "var(--accent-contrast)" : "var(--text-muted)",
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 12 : 20 }}>
        {loading && !status ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            Loading lab status...
          </div>
        ) : !status ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            No status available for this lab.
          </div>
        ) : (
          <>
            {/* WORKERS TAB */}
            {activeTab === "workers" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
                  {Object.entries(status.workers).map(([role, w]) => {
                    const isAlive = w.alive;
                    const isBusy = w.busy;
                    const isHeld = w.held;

                    return (
                      <div
                        key={role}
                        style={{
                          background: "var(--bg-panel)",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          padding: 16,
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 16, textTransform: "capitalize" }}>
                              {role}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                              {w.sessionId}
                            </div>
                          </div>

                          {/* Status pill */}
                          <div
                            style={{
                              padding: "4px 10px",
                              borderRadius: 12,
                              fontSize: 12,
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              background: !isAlive
                                ? "rgba(239, 68, 68, 0.15)"
                                : isHeld
                                ? "rgba(245, 158, 11, 0.15)"
                                : isBusy
                                ? "rgba(16, 185, 129, 0.15)"
                                : "rgba(59, 130, 246, 0.15)",
                              color: !isAlive
                                ? "#ef4444"
                                : isHeld
                                ? "#f59e0b"
                                : isBusy
                                ? "#10b981"
                                : "#3b82f6",
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: !isAlive
                                  ? "#ef4444"
                                  : isHeld
                                  ? "#f59e0b"
                                  : isBusy
                                  ? "#10b981"
                                  : "#3b82f6",
                              }}
                            />
                            <span>
                              {!isAlive ? "Dead" : isHeld ? "Taken Over" : isBusy ? "Busy (running)" : "Idle"}
                            </span>
                          </div>
                        </div>

                        {/* Metadata row */}
                        <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", flexWrap: "wrap", gap: 12 }}>
                          {w.model && (
                            <div>
                              Model: <span style={{ color: "var(--text)", fontWeight: 500 }}>{w.model}</span>
                            </div>
                          )}
                          <div>
                            Restarts: <span style={{ color: "var(--text)" }}>{w.restarts}</span>
                          </div>
                          <div>
                            Pending Wakes: <span style={{ color: "var(--text)" }}>{w.pending}</span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                          <button
                            onClick={() => {
                              setSteerModalRole(role);
                              setSteerMessage("");
                            }}
                            disabled={!isAlive}
                            style={{
                              background: "rgba(245, 158, 11, 0.12)",
                              color: "#f59e0b",
                              border: "1px solid rgba(245, 158, 11, 0.3)",
                              borderRadius: 6,
                              padding: "8px 10px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: isAlive ? "pointer" : "not-allowed",
                              opacity: isAlive ? 1 : 0.5,
                            }}
                          >
                            ⚡ Steer
                          </button>
                          <button
                            onClick={() => {
                              setSendModalRole(role);
                              setSendMessage("");
                            }}
                            style={{
                              background: "var(--bg-hover)",
                              color: "var(--text)",
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              padding: "8px 10px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            📬 Send Inbox
                          </button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <button
                            onClick={() => {
                              if (selectedLabPath && onOpenSession) {
                                onOpenSession(selectedLabPath, w.sessionId);
                                onClose();
                              }
                            }}
                            style={{
                              background: "var(--accent)",
                              color: "var(--accent-contrast)",
                              border: "none",
                              borderRadius: 6,
                              padding: "8px 10px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            💬 Open Chat
                          </button>
                          <button
                            onClick={() => handleRestartRole(role)}
                            disabled={actionInProgress}
                            style={{
                              background: "var(--bg-hover)",
                              color: "var(--text-muted)",
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              padding: "8px 10px",
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            🔄 Restart
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* BEADS TAB */}
            {activeTab === "beads" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Filter Selector */}
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                  {[
                    { key: "ready", label: "🟢 Ready", count: status.beads.readyCount },
                    { key: "needsReview", label: "🔍 Needs Review", count: status.beads.needsReviewCount },
                    { key: "needsReproduce", label: "⚠️ Needs Reproduce", count: status.beads.needsReproduceCount },
                    { key: "returned", label: "🔄 Returned / Rework", count: status.beads.returnedCount },
                  ].map((filter) => {
                    const isSelected = beadsFilter === filter.key;
                    return (
                      <button
                        key={filter.key}
                        onClick={() => setBeadsFilter(filter.key as BeadsFilter)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 20,
                          border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                          background: isSelected ? "var(--accent)" : "var(--bg-panel)",
                          color: isSelected ? "var(--accent-contrast)" : "var(--text)",
                          fontSize: 12,
                          fontWeight: isSelected ? 600 : 500,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>{filter.label}</span>
                        <span style={{ opacity: 0.8, fontSize: 11 }}>({filter.count})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Beads Cards List */}
                {/* List / Graph view toggle */}
                <div style={{ display: "flex", gap: 8 }}>
                  {(["list", "graph", "timeline"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setBeadsView(v)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 20,
                        border: beadsView === v ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: beadsView === v ? "var(--accent)" : "var(--bg-panel)",
                        color: beadsView === v ? "var(--accent-contrast)" : "var(--text)",
                        fontSize: 12,
                        fontWeight: beadsView === v ? 600 : 500,
                        cursor: "pointer",
                      }}
                    >
                      {v === "list" ? "📋 List" : v === "graph" ? "🕸️ Graph" : "⏳ Timeline"}
                    </button>
                  ))}
                </div>
                {beadsView === "graph" && selectedLabPath ? (
                  <BeadsGraph labPath={selectedLabPath} />
                ) : beadsView === "timeline" && selectedLabPath ? (
                  <BeadsTimeline labPath={selectedLabPath} />
                ) : filteredBeads.length === 0 ? (
                  <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                    No beads in this category.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {filteredBeads.map((bead) => (
                      <div
                        key={bead.id}
                        style={{
                          background: "var(--bg-panel)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: 14,
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          cursor: "pointer",
                        }}
                        onClick={() => setSelectedBead(bead)}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div>
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 12,
                                fontWeight: 700,
                                color: "var(--accent)",
                                marginRight: 8,
                              }}
                            >
                              {bead.id}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{bead.title}</span>
                          </div>
                          {bead.priority !== undefined && (
                            <span
                              style={{
                                fontSize: 11,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "var(--bg-hover)",
                                color: "var(--text-muted)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              P{bead.priority}
                            </span>
                          )}
                        </div>

                        {/* Labels row */}
                        {bead.labels && bead.labels.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {bead.labels.map((lbl) => (
                              <span
                                key={lbl}
                                style={{
                                  fontSize: 11,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: lbl === "approved-reproduce" ? "rgba(16, 185, 129, 0.2)" : "var(--bg-selected)",
                                  color: lbl === "approved-reproduce" ? "#10b981" : "var(--text-muted)",
                                }}
                              >
                                {lbl}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Reproduce Quick Action Button */}
                        {beadsFilter === "needsReproduce" && (
                          <div style={{ marginTop: 6 }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApproveReproduce(bead.id);
                              }}
                              disabled={actionInProgress}
                              style={{
                                background: "#10b981",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: 6,
                                padding: "6px 12px",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              ⚡ Approve GPU Reproduce
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* GPU QUEUE TAB */}
            {activeTab === "gpu" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
                    RTX 5090 Shared Queue Status
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Cooperative GPU queue. One job runs at a time.
                  </div>
                </div>

                {/* Running Jobs */}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: "var(--text-muted)" }}>
                    ACTIVE RUNNING JOBS ({status.gpuQueue.running.length})
                  </div>
                  {status.gpuQueue.running.length === 0 ? (
                    <div style={{ padding: 14, background: "var(--bg-panel)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)" }}>
                      GPU is currently idle. No job running.
                    </div>
                  ) : (
                    status.gpuQueue.running.map((job) => (
                      <div
                        key={job.id}
                        style={{
                          background: "var(--bg-panel)",
                          border: "1px solid #10b981",
                          borderRadius: 8,
                          padding: 14,
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "#10b981" }}>
                            {job.id}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: "rgba(16, 185, 129, 0.2)", color: "#10b981" }}>
                            running ({job.runtime})
                          </span>
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all" }}>
                          {job.command}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                          <button
                            onClick={() => handleOpenGpuLogs(job)}
                            style={{
                              background: "var(--accent)",
                              color: "var(--accent-contrast)",
                              border: "none",
                              borderRadius: 6,
                              padding: "6px 12px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            📜 View Logs
                          </button>
                          <button
                            onClick={() => handleCancelGpuJob(job.id)}
                            style={{
                              background: "rgba(239, 68, 68, 0.15)",
                              color: "#ef4444",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              borderRadius: 6,
                              padding: "6px 12px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            🛑 Cancel
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Queued Jobs */}
                {status.gpuQueue.queued.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: "var(--text-muted)" }}>
                      QUEUED JOBS ({status.gpuQueue.queued.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {status.gpuQueue.queued.map((job, idx) => (
                        <div
                          key={job.id}
                          style={{
                            background: "var(--bg-panel)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            padding: 12,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>#{idx + 1}</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>{job.id}</span>
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {job.command}
                            </div>
                          </div>
                          <button
                            onClick={() => handleCancelGpuJob(job.id)}
                            style={{
                              background: "none",
                              color: "#ef4444",
                              border: "none",
                              cursor: "pointer",
                              padding: 6,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Jobs */}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: "var(--text-muted)" }}>
                    RECENT COMPLETED / FAILED JOBS
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {status.gpuQueue.recent.map((job) => (
                      <div
                        key={job.id}
                        onClick={() => handleOpenGpuLogs(job)}
                        style={{
                          background: "var(--bg-panel)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          padding: "8px 12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0, flex: 1 }}>
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 600,
                              background:
                                job.state === "finished"
                                  ? "rgba(16, 185, 129, 0.15)"
                                  : "rgba(239, 68, 68, 0.15)",
                              color: job.state === "finished" ? "#10b981" : "#ef4444",
                              textTransform: "uppercase",
                            }}
                          >
                            {job.state}
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{job.id}</span>
                          <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {job.command}
                          </span>
                        </div>
                        <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap", marginLeft: 8 }}>
                          {job.runtime}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* EXPERIMENTS TAB */}
            {activeTab === "experiments" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                    Experiment Runs ({status.experiments.length})
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Artifacts per task in experiments/&lt;bd-id&gt;/: run.sh, metrics.json, output.log
                  </div>
                </div>

                {status.experiments.length === 0 ? (
                  <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                    No experiments found in this lab.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
                    {status.experiments.map((exp) => (
                      <div
                        key={exp.id}
                        onClick={() => handleOpenExperiment(exp)}
                        style={{
                          background: "var(--bg-panel)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: 12,
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
                          {exp.id}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11 }}>
                          {exp.hasMetrics && (
                            <span style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
                              metrics.json
                            </span>
                          )}
                          {exp.hasLog && (
                            <span style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6" }}>
                              output.log
                            </span>
                          )}
                          {exp.hasJob && (
                            <span style={{ padding: "2px 6px", borderRadius: 4, background: "var(--bg-selected)", color: "var(--text-muted)" }}>
                              job.json
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* LOGS & INBOXES TAB */}
            {activeTab === "logs" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Daemon Log Tail */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
                    Daemon Log Tail (labd.log)
                  </div>
                  <div
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 12,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      lineHeight: 1.5,
                      maxHeight: 280,
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {status.daemonLogs.length === 0 ? "No log entries" : status.daemonLogs.join("\n")}
                  </div>
                </div>

                {/* Role Inboxes */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
                    Role Inboxes (.lab/inbox/)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {Object.entries(status.inboxes).map(([role, messages]) => (
                      <div
                        key={role}
                        style={{
                          background: "var(--bg-panel)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: 12,
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, textTransform: "capitalize" }}>
                          {role} inbox ({messages.length} recent)
                        </div>
                        {messages.length === 0 ? (
                          <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                            Inbox empty
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {messages.map((msg, i) => (
                              <div
                                key={i}
                                style={{
                                  background: "var(--bg)",
                                  padding: 8,
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontFamily: "var(--font-mono)",
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {msg}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* STEER MODAL */}
      {steerModalRole && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
          }}
          onClick={() => setSteerModalRole(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 20,
              width: "100%",
              maxWidth: 480,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              ⚡ Steer Worker: {steerModalRole}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Steer interrupts the running turn after the current tool call, or wakes an idle worker.
            </div>
            <textarea
              value={steerMessage}
              onChange={(e) => setSteerMessage(e.target.value)}
              placeholder="e.g. Stop the current experiment and use seed 7 instead..."
              rows={4}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 6,
                background: "var(--bg-panel)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                fontSize: 13,
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setSteerModalRole(null)}
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  borderRadius: 6,
                  padding: "8px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSteerSubmit}
                disabled={actionInProgress || !steerMessage.trim()}
                style={{
                  background: "#f59e0b",
                  color: "#000000",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {actionInProgress ? "Steering..." : "Send Steer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SEND INBOX MODAL */}
      {sendModalRole && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
          }}
          onClick={() => setSendModalRole(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 20,
              width: "100%",
              maxWidth: 480,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              📬 Send Message to {sendModalRole}'s Inbox
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Appends a signed section into .lab/inbox/{sendModalRole}.md. The daemon wakes the recipient on next poll.
            </div>
            <textarea
              value={sendMessage}
              onChange={(e) => setSendMessage(e.target.value)}
              placeholder="e.g. Please verify the latest benchmark numbers..."
              rows={4}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 6,
                background: "var(--bg-panel)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                fontSize: 13,
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setSendModalRole(null)}
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  borderRadius: 6,
                  padding: "8px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSendSubmit}
                disabled={actionInProgress || !sendMessage.trim()}
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-contrast)",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {actionInProgress ? "Sending..." : "Send Message"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BEAD DETAILS MODAL */}
      {selectedBead && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
          }}
          onClick={() => setSelectedBead(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 20,
              width: "100%",
              maxWidth: 600,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>
                  {selectedBead.id}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedBead.title}</div>
              </div>
              <button
                onClick={() => setSelectedBead(null)}
                style={{ background: "none", border: "none", fontSize: 18, color: "var(--text)", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Labels */}
            {selectedBead.labels && selectedBead.labels.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {selectedBead.labels.map((lbl) => (
                  <span
                    key={lbl}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      background: "var(--bg-selected)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {lbl}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            {selectedBead.description && (
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Description</div>
                <div
                  style={{
                    background: "var(--bg-panel)",
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {selectedBead.description}
                </div>
              </div>
            )}

            {/* Approve Reproduce Button */}
            {selectedBead.labels?.includes("needs-reproduce") && (
              <button
                onClick={() => handleApproveReproduce(selectedBead.id)}
                disabled={actionInProgress}
                style={{
                  background: "#10b981",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ⚡ Approve GPU Reproduce
              </button>
            )}

            {/* Add Comment */}
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Add Comment</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={beadCommentText}
                  onChange={(e) => setBeadCommentText(e.target.value)}
                  placeholder="Post comment to bead..."
                  style={{
                    flex: 1,
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-panel)",
                    color: "var(--text)",
                    fontSize: 13,
                  }}
                />
                <button
                  onClick={() => handleAddComment(selectedBead.id)}
                  disabled={actionInProgress || !beadCommentText.trim()}
                  style={{
                    background: "var(--accent)",
                    color: "var(--accent-contrast)",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Comment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GPU LOGS MODAL */}
      {viewGpuJob && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
          }}
          onClick={() => setViewGpuJob(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 20,
              width: "100%",
              maxWidth: 700,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>
                Logs: {viewGpuJob.id}
              </div>
              <button
                onClick={() => setViewGpuJob(null)}
                style={{ background: "none", border: "none", fontSize: 18, color: "var(--text)", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              {viewGpuJob.command}
            </div>
            <div
              style={{
                flex: 1,
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: 12,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                lineHeight: 1.4,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {loadingGpuLogs ? "Loading job logs..." : gpuJobLogs || "No logs available"}
            </div>
          </div>
        </div>
      )}

      {/* EXPERIMENT DETAILS MODAL */}
      {viewExperiment && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
          }}
          onClick={() => setViewExperiment(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 20,
              width: "100%",
              maxWidth: 700,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700 }}>
                Experiment: {viewExperiment.id}
              </div>
              <button
                onClick={() => setViewExperiment(null)}
                style={{ background: "none", border: "none", fontSize: 18, color: "var(--text)", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {loadingExperiment ? (
              <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)" }}>
                Loading experiment artifacts...
              </div>
            ) : experimentDetails ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {experimentDetails.metrics && (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>metrics.json</div>
                    <pre
                      style={{
                        background: "var(--bg-panel)",
                        padding: 10,
                        borderRadius: 6,
                        fontSize: 11,
                        overflowX: "auto",
                      }}
                    >
                      {typeof experimentDetails.metrics === "string"
                        ? experimentDetails.metrics
                        : JSON.stringify(experimentDetails.metrics, null, 2)}
                    </pre>
                  </div>
                )}

                {experimentDetails.outputLog && (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>output.log</div>
                    <pre
                      style={{
                        background: "var(--bg-panel)",
                        padding: 10,
                        borderRadius: 6,
                        fontSize: 11,
                        overflowX: "auto",
                        maxHeight: 200,
                      }}
                    >
                      {experimentDetails.outputLog}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Failed to load experiment artifacts</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
