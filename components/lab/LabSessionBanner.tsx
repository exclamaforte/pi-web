"use client";

import { useEffect, useState, useCallback } from "react";
import type { LabWorkerStatus } from "@/lib/lab-service";

interface Props {
  sessionId: string;
  cwd: string | null;
  onOpenLabDashboard: (labPath?: string) => void;
}

export function LabSessionBanner({ sessionId, cwd, onOpenLabDashboard }: Props) {
  const [workerStatus, setWorkerStatus] = useState<LabWorkerStatus | null>(null);
  // A lab worker whose daemon is down: transcript is read-only in pi-web,
  // but the inbox (the lab's own mechanism) still accepts messages.
  const [deadLab, setDeadLab] = useState<{ role: string; labPath: string } | null>(null);
  const [labName, setLabName] = useState<string>("");
  const [labPath, setLabPath] = useState<string | null>(null);
  const [steerModalOpen, setSteerModalOpen] = useState(false);
  const [steerText, setSteerText] = useState("");
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendText, setSendText] = useState("");
  const [actionInProgress, setActionInProgress] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Check if session is a lab session. The cwd scopes the lookup: several
  // labs share one worker session id (`lab-<role>`).
  const checkStatus = useCallback(async () => {
    try {
      const url = cwd
        ? `/api/agent/${encodeURIComponent(sessionId)}?cwd=${encodeURIComponent(cwd)}`
        : `/api/agent/${encodeURIComponent(sessionId)}`;
      const res = await fetch(url);
      if (!res.ok) return; // transient transport error: keep last known status
      const json = await res.json();
      if (!(json.running && json.labWorker && json.state)) {
        // Not a live worker. A dead-daemon lab worker keeps a read-only
        // banner (inbox still works); anything else clears the banner.
        setWorkerStatus(null);
        if (json.labWorker && json.readOnly && typeof json.role === "string" && typeof json.labPath === "string") {
          setDeadLab({ role: json.role, labPath: json.labPath });
          setLabPath(json.labPath);
          const parts = json.labPath.split("/");
          setLabName(parts[parts.length - 1] || "Lab");
        } else {
          setDeadLab(null);
          setLabPath(null);
          setLabName("");
        }
        return;
      }
      setDeadLab(null);
      setWorkerStatus({
          role: json.state.role,
          sessionId,
          alive: true,
          connected: true,
          busy: json.state.isPromptRunning || json.state.isStreaming,
          pending: json.state.pending || 0,
          held: json.state.held || false,
          parkedOn: Array.isArray(json.state.parkedOn) ? json.state.parkedOn.map(String) : undefined,
          parked: json.state.parked || false,
          restarts: 0,
          model: json.state.model?.id,
        });
        setLabPath(json.state.labPath);
        if (json.state.labPath) {
          const parts = json.state.labPath.split("/");
          setLabName(parts[parts.length - 1] || "Lab");
        }
    } catch {
      // not a lab worker or error
    }
  }, [sessionId, cwd]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const activeRole = workerStatus?.role ?? deadLab?.role ?? null;
  if (!workerStatus && !deadLab) return null;

  const handleSteer = async () => {
    if (!labPath || !activeRole || !steerText.trim()) return;
    setActionInProgress(true);
    try {
      const res = await fetch("/api/lab/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "steer",
          path: labPath,
          role: activeRole,
          message: steerText.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setFeedback("Steer dispatched to worker");
        setSteerModalOpen(false);
        setSteerText("");
        checkStatus();
      }
    } catch (e) {
      setFeedback(`Steer failed: ${String(e)}`);
    } finally {
      setActionInProgress(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleSend = async () => {
    if (!labPath || !activeRole || !sendText.trim()) return;
    setActionInProgress(true);
    try {
      const res = await fetch("/api/lab/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          path: labPath,
          role: activeRole,
          message: sendText.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setFeedback("Message sent to worker inbox");
        setSendModalOpen(false);
        setSendText("");
        checkStatus();
      }
    } catch (e) {
      setFeedback(`Send failed: ${String(e)}`);
    } finally {
      setActionInProgress(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  return (
    <>
      {workerStatus ? (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: 14 }}>🧪</span>
          <span style={{ fontWeight: 700, color: "var(--text)" }}>
            Lab Worker: <span style={{ textTransform: "capitalize" }}>{workerStatus.role}</span>
          </span>
          {labName && (
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
              ({labName})
            </span>
          )}

          {/* Status Badge */}
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 600,
              background: workerStatus.held
                ? "rgba(245, 158, 11, 0.15)"
                : workerStatus.parked
                ? "rgba(168, 85, 247, 0.15)"
                : workerStatus.busy
                ? "rgba(16, 185, 129, 0.15)"
                : "rgba(59, 130, 246, 0.15)",
              color: workerStatus.held
                ? "#f59e0b"
                : workerStatus.parked
                ? "#a855f7"
                : workerStatus.busy
                ? "#10b981"
                : "#3b82f6",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: workerStatus.held
                  ? "#f59e0b"
                  : workerStatus.parked
                  ? "#a855f7"
                  : workerStatus.busy
                  ? "#10b981"
                  : "#3b82f6",
              }}
            />
            {workerStatus.held
              ? "Taken Over"
              : workerStatus.parked
              ? "Parked (waiting for job)"
              : workerStatus.busy
              ? "Busy"
              : "Idle"}
          </span>

          {workerStatus.model && (
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
              model: {workerStatus.model}
            </span>
          )}
          {workerStatus.parked && workerStatus.parkedOn && workerStatus.parkedOn.length > 0 && (
            <span style={{ color: "#a855f7", fontSize: 11 }} title={workerStatus.parkedOn.join("\n")}>
              on {workerStatus.parkedOn.slice(0, 2).join("; ")}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setSteerModalOpen(true)}
            title="Interrupt and redirect worker"
            style={{
              background: "rgba(245, 158, 11, 0.12)",
              color: "#f59e0b",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ⚡ Steer
          </button>
          <button
            onClick={() => setSendModalOpen(true)}
            title="Send to worker inbox"
            style={{
              background: "var(--bg-hover)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            📬 Inbox
          </button>
          <button
            onClick={() => onOpenLabDashboard(labPath || undefined)}
            title="Open full Lab Dashboard"
            style={{
              background: "var(--accent)",
              color: "var(--accent-contrast)",
              border: "none",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🧪 Dashboard
          </button>
        </div>
      </div>
      ) : deadLab ? (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: 14 }}>🧪</span>
          <span style={{ fontWeight: 700, color: "var(--text)" }}>
            Lab Worker: <span style={{ textTransform: "capitalize" }}>{deadLab.role}</span>
          </span>
          {labName && (
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
              ({labName})
            </span>
          )}
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 600,
              background: "rgba(239, 68, 68, 0.15)",
              color: "#ef4444",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#ef4444",
              }}
            />
            labd down — read-only
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
            Chat is disabled while the daemon is down. Fork to chat with a copy, or send to inbox.
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setSendModalOpen(true)}
            title="Send to worker inbox"
            style={{
              background: "var(--bg-hover)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            📬 Inbox
          </button>
          <button
            onClick={() => onOpenLabDashboard(labPath || undefined)}
            title="Open full Lab Dashboard"
            style={{
              background: "var(--accent)",
              color: "var(--accent-contrast)",
              border: "none",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🧪 Dashboard
          </button>
        </div>
      </div>
      ) : null}

      {feedback && (
        <div
          style={{
            padding: "4px 10px",
            background: "var(--accent)",
            color: "var(--accent-contrast)",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {feedback}
        </div>
      )}

      {/* Steer Modal (live workers only — no steer target when the daemon is down) */}
      {steerModalOpen && workerStatus && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setSteerModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 16,
              width: "100%",
              maxWidth: 420,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              ⚡ Steer {workerStatus.role}
            </div>
            <textarea
              value={steerText}
              onChange={(e) => setSteerText(e.target.value)}
              placeholder="Enter immediate instructions to steer the worker..."
              rows={3}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                background: "var(--bg-panel)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                fontSize: 12,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setSteerModalOpen(false)}
                style={{ background: "none", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 4, padding: "6px 12px", fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSteer}
                disabled={actionInProgress || !steerText.trim()}
                style={{ background: "#f59e0b", color: "#000", border: "none", borderRadius: 4, padding: "6px 12px", fontSize: 12, fontWeight: 600 }}
              >
                {actionInProgress ? "Steering..." : "Send Steer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Modal */}
      {sendModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setSendModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 16,
              width: "100%",
              maxWidth: 420,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              📬 Send Message to {activeRole}'s Inbox
            </div>
            <textarea
              value={sendText}
              onChange={(e) => setSendText(e.target.value)}
              placeholder="Enter message for inbox..."
              rows={3}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                background: "var(--bg-panel)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                fontSize: 12,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setSendModalOpen(false)}
                style={{ background: "none", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 4, padding: "6px 12px", fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={actionInProgress || !sendText.trim()}
                style={{ background: "var(--accent)", color: "var(--accent-contrast)", border: "none", borderRadius: 4, padding: "6px 12px", fontSize: 12, fontWeight: 600 }}
              >
                {actionInProgress ? "Sending..." : "Send to Inbox"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
