"use client";

import { useEffect, useState, useCallback } from "react";
import type { BeadMemory } from "@/lib/lab-service";

interface Props {
  labPath: string;
}

export function BeadsMemories({ labPath }: Props) {
  const [memories, setMemories] = useState<BeadMemory[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [insightInput, setInsightInput] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [forgettingKey, setForgettingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadMemories = useCallback(async (query = "") => {
    setLoading(true);
    setError(null);
    try {
      const q = query.trim();
      const url = `/api/lab/beads?path=${encodeURIComponent(labPath)}&view=memories${
        q ? `&search=${encodeURIComponent(q)}` : ""
      }`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setMemories(json.data);
      } else {
        setError(json.error || "Failed to load memories");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [labPath]);

  useEffect(() => {
    setMemories(null);
    setSearch("");
  }, [labPath]);

  useEffect(() => {
    loadMemories(search);
  }, [loadMemories, search]);

  const handleRemember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insightInput.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/lab/beads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remember",
          path: labPath,
          insight: insightInput.trim(),
          key: keyInput.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionFeedback(`Remembered [${json.data?.key || "memory"}]`);
        setInsightInput("");
        setKeyInput("");
        setIsAdding(false);
        loadMemories(search);
      } else {
        setActionFeedback(`Failed: ${json.error || "Could not save memory"}`);
      }
    } catch (err) {
      setActionFeedback(`Error: ${String(err)}`);
    } finally {
      setSubmitting(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  const handleForget = async (key: string) => {
    if (!confirm(`Forget memory [${key}]? This cannot be undone.`)) return;
    setForgettingKey(key);
    try {
      const res = await fetch("/api/lab/beads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "forget",
          path: labPath,
          key,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionFeedback(`Forgot [${key}]`);
        loadMemories(search);
      } else {
        setActionFeedback(`Failed to forget: ${json.error || "Unknown error"}`);
      }
    } catch (err) {
      setActionFeedback(`Error: ${String(err)}`);
    } finally {
      setForgettingKey(null);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
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
            <span style={{ fontSize: 18 }}>🧠</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Persistent Memories</span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 12,
                background: "rgba(168, 85, 247, 0.15)",
                color: "#a855f7",
                fontWeight: 600,
              }}
            >
              bd remember
            </span>
          </div>
          <button
            onClick={() => setIsAdding(!isAdding)}
            style={{
              background: isAdding ? "var(--bg-hover)" : "var(--accent)",
              color: isAdding ? "var(--text)" : "var(--accent-contrast)",
              border: isAdding ? "1px solid var(--border)" : "none",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {isAdding ? "✕ Close Form" : "➕ Remember New"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
          Shared project knowledge, architectural decisions, and agent insights stored directly in Beads. Injected automatically into agent sessions during <code>bd prime</code>.
        </div>
      </div>

      {/* Feedback banner */}
      {actionFeedback && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12,
            background: actionFeedback.startsWith("Failed") || actionFeedback.startsWith("Error")
              ? "rgba(239, 68, 68, 0.15)"
              : "rgba(16, 185, 129, 0.15)",
            color: actionFeedback.startsWith("Failed") || actionFeedback.startsWith("Error") ? "#ef4444" : "#10b981",
            border: `1px solid ${actionFeedback.startsWith("Failed") || actionFeedback.startsWith("Error") ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
          }}
        >
          {actionFeedback}
        </div>
      )}

      {/* Add Memory Form */}
      {isAdding && (
        <form
          onSubmit={handleRemember}
          style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--accent)",
            borderRadius: 8,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>Add a Persistent Memory</div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-muted)", marginBottom: 4 }}>
              Insight / Content (required)
            </label>
            <textarea
              value={insightInput}
              onChange={(e) => setInsightInput(e.target.value)}
              placeholder="e.g. Always run tests with -race flag; RTX 5090 queue must be accessed via ts..."
              required
              rows={3}
              style={{
                width: "100%",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "8px 10px",
                color: "var(--text)",
                fontSize: 13,
                fontFamily: "inherit",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-muted)", marginBottom: 4 }}>
              Explicit Key (optional — auto-generated if left blank)
            </label>
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="e.g. test-flags, gpu-queue-rule"
              style={{
                width: "100%",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "8px 10px",
                color: "var(--text)",
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              style={{
                background: "var(--bg-hover)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !insightInput.trim()}
              style={{
                background: "var(--accent)",
                color: "var(--accent-contrast)",
                border: "none",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: submitting || !insightInput.trim() ? "not-allowed" : "pointer",
                opacity: submitting || !insightInput.trim() ? 0.6 : 1,
              }}
            >
              {submitting ? "Saving…" : "Save Memory"}
            </button>
          </div>
        </form>
      )}

      {/* Search & Counter Controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories by keyword..."
            style={{
              width: "100%",
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "7px 10px 7px 30px",
              color: "var(--text)",
              fontSize: 12,
              boxSizing: "border-box",
            }}
          />
          <span style={{ position: "absolute", left: 9, top: 7, fontSize: 13, color: "var(--text-muted)", pointerEvents: "none" }}>
            🔍
          </span>
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              style={{
                position: "absolute",
                right: 8,
                top: 6,
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              ✕
            </button>
          )}
        </div>
        {memories && (
          <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {memories.length} {memories.length === 1 ? "memory" : "memories"}
          </span>
        )}
      </div>

      {/* Memories List */}
      {loading && (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Loading memories…
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: 14, background: "rgba(239, 68, 68, 0.12)", color: "#ef4444", borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && memories && memories.length === 0 && (
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
            gap: 8,
          }}
        >
          <span style={{ fontSize: 24 }}>🧠</span>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {search ? "No matching memories found" : "No memories stored yet"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 380, lineHeight: 1.5 }}>
            {search
              ? `No memories match query "${search}". Try clearing search.`
              : 'Store persistent insights across sessions with "➕ Remember New" above or via CLI with bd remember "insight".'}
          </div>
        </div>
      )}

      {!loading && !error && memories && memories.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {memories.map((m) => {
            const isDeleting = forgettingKey === m.key;
            return (
              <div
                key={m.key}
                style={{
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#a855f7",
                        background: "rgba(168, 85, 247, 0.12)",
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}
                    >
                      {m.key}
                    </span>
                    <button
                      onClick={() => handleCopy(m.key, `key-${m.key}`)}
                      title="Copy Key"
                      style={{
                        background: "none",
                        border: "none",
                        color: copiedKey === `key-${m.key}` ? "#10b981" : "var(--text-muted)",
                        fontSize: 11,
                        cursor: "pointer",
                        padding: "2px 4px",
                      }}
                    >
                      {copiedKey === `key-${m.key}` ? "✓ Copied" : "📋"}
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => handleCopy(m.insight, `insight-${m.key}`)}
                      style={{
                        background: "var(--bg-hover)",
                        color: copiedKey === `insight-${m.key}` ? "#10b981" : "var(--text-muted)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        padding: "3px 8px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      {copiedKey === `insight-${m.key}` ? "✓ Copied" : "Copy"}
                    </button>
                    <button
                      onClick={() => handleForget(m.key)}
                      disabled={isDeleting}
                      title="Forget memory"
                      style={{
                        background: "rgba(239, 68, 68, 0.12)",
                        color: "#ef4444",
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                        borderRadius: 4,
                        padding: "3px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: isDeleting ? "not-allowed" : "pointer",
                        opacity: isDeleting ? 0.6 : 1,
                      }}
                    >
                      {isDeleting ? "…" : "🗑️ Forget"}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    color: "var(--text)",
                  }}
                >
                  {m.insight}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
