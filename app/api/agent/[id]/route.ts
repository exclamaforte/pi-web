import { NextResponse } from "next/server";
import { resolveSessionPath, readSessionHeader, listAllSessions, openSessionManager, getSessionSettings, getLastAssistantText } from "@/lib/session-reader";
import { computeSessionStats } from "@/lib/session-stats";
import { startRpcSession, getRpcSession, setRpcSessionTools, shutdownWrappersForFile } from "@/lib/rpc-manager";
import { isLabSession, isDaemonAlive, sendLabdIpc, steerLabWorker, sendLabInbox, LAB_SESSION_ID_PATTERN } from "@/lib/lab-service";

// Commands allowed against a lab worker session whose daemon is down: pure
// reads, run control for an already-admitted run, and fork-family ops which
// write new files instead of the worker's transcript. Everything else
// (prompt/steer/follow_up/bash/compact/renames/tool pins/branch moves)
// appends to a file pi-web doesn't own and is rejected with 409.
const LAB_READONLY_OK = new Set([
  "get_state",
  "get_session_stats",
  "get_last_assistant_text",
  "get_tools",
  "get_commands",
  "fork",
  "fork_branch",
  "clone",
  "abort",
  "abort_bash",
  "abort_compaction",
  "extension_ui_response",
  "extension_ui_input",
]);

// Fork-family ops copy the transcript to a new file instead of appending to
// the worker's. They stay allowed against a live worker (explicit user op,
// served by the wrapper flow); everything else on a live worker goes through
// labd (steer/inbox/state) or is rejected, so pi-web never attaches its own
// pi to a transcript it doesn't own.
const LAB_LIVE_FORK_OK = new Set([
  "fork",
  "fork_branch",
  "clone",
]);

function labWorkerProtectedError(id: string, role: string, labPath: string) {
  return NextResponse.json({
    error: `Session '${id}' belongs to live lab worker '${role}' (${labPath}). ` +
      `pi-web will not attach to or write its transcript: steer it from the Lab view, ` +
      `message its inbox, or fork it to chat with a copy.`,
    code: "lab_worker_protected",
  }, { status: 409 });
}

// Pure reads answered from the session file when no live wrapper exists.
// Standing up a full AgentSession (transcript parse + services + model
// runtime + extension binding) just to report dormant state is pure waste —
// and for a dormant session the file IS the truth, the same aggregation the
// SDK computes on attach. A live wrapper stays authoritative when present.
function readSessionReadOnly(sessionFile: string, sessionId: string, type: string) {
  const sm = openSessionManager(sessionFile);
  const entries = sm.getEntries();
  const leafId = sm.getLeafId();
  if (type === "get_session_stats") {
    return {
      sessionFile,
      sessionId,
      sessionName: sm.getSessionName() || undefined,
      ...computeSessionStats(entries as never),
    };
  }
  if (type === "get_last_assistant_text") {
    return { text: getLastAssistantText(entries as never, leafId) };
  }
  const settings = getSessionSettings(entries as never, leafId);
  return {
    sessionId,
    sessionFile,
    model: settings.model ? { provider: settings.model.provider, id: settings.model.modelId } : undefined,
    thinkingLevel: settings.thinkingLevel ?? "off",
    isStreaming: false,
    isPromptRunning: false,
    isBashRunning: false,
    isCompacting: false,
    // Dormant sessions hold no runtime flags: nothing can be running without
    // a live wrapper, and a fresh wrapper would report these same defaults.
    autoCompactionEnabled: true,
    messageCount: 0,
    pendingMessageCount: 0,
    queuedMessages: { steering: [], followUp: [] },
    contextUsage: null,
    // The exact prompt needs resource/extension assembly (wrapper work);
    // the field is optional and callers fall back to "".
    systemPrompt: "",
    extensionStatuses: [],
    extensionWidgets: [],
  };
}

// POST /api/agent/[id] - Send a command to an existing session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let commandType: string | undefined;
  let promptAccepted = false;

  try {
    const body = await req.json() as { type: string; cwd?: string; [key: string]: unknown };
    commandType = typeof body.type === "string" ? body.type : undefined;
    const cwd = new URL(req.url).searchParams.get("cwd") || (typeof body.cwd === "string" ? body.cwd : undefined);
    const requestedToolNames = body.toolNames;
    if (
      requestedToolNames !== undefined
      && (!Array.isArray(requestedToolNames) || requestedToolNames.some((name) => typeof name !== "string"))
    ) {
      throw new Error("toolNames must be an array of strings");
    }
    const toolNames = requestedToolNames as string[] | undefined;

    // A bare `lab-<role>` id with no cwd is ambiguous across labs (every lab
    // reuses the same ids). Refuse to guess instead of steering or attaching
    // to the wrong worker's transcript.
    if (!cwd && LAB_SESSION_ID_PATTERN.test(id)) {
      const candidates = (await listAllSessions()).filter((s) => s.id === id);
      if (candidates.length > 1) {
        const homes = [...new Set(candidates.map((s) => s.cwd).filter(Boolean))];
        return NextResponse.json({
          error: `Session '${id}' exists in ${candidates.length} places` +
            (homes.length ? ` (${homes.join(", ")})` : "") +
            `. Open it from the Lab view or pass ?cwd=<lab path> so pi-web talks to the right worker.`,
          code: "cwd_required",
        }, { status: 409 });
      }
    }

    // Resolve lab identity BEFORE consulting any web-owned wrapper. A stale
    // wrapper attached on an earlier view must never win over the live worker:
    // prompts to it were answered by the web's model instead of the worker's.
    const direct = getRpcSession(id, cwd);
    let labFile: string | null = direct?.sessionFile || null;
    if (!labFile) labFile = await resolveSessionPath(id, cwd);
    let labHeader = null;
    if (labFile) {
      try { labHeader = readSessionHeader(labFile); } catch { labHeader = null; }
    }
    const lab = isLabSession(id, labHeader?.cwd || cwd);
    const labLive = !!lab.isLab && !!lab.labPath && !!lab.role
      && isDaemonAlive(lab.labPath).alive;

    if (labLive) {
      // From here on only labd touches this transcript. Shut down hijack
      // wrappers first (the direct hit, if it is this file, plus anything
      // else attached to it under another key), and never start a new one.
      const labPath = lab.labPath as string;
      const role = lab.role as string;
      try {
        if (direct && (!direct.sessionFile || direct.sessionFile === labFile)) {
          await direct.shutdown();
        }
      } catch { /* already gone */ }
      if (labFile) await shutdownWrappersForFile(labFile);

      if (body.type === "prompt") {
        const message = typeof body.message === "string" ? body.message : "";
        if (body.delivery === "inbox") {
          const res = await sendLabInbox(labPath, role, message, (body.from as string) || "human");
          if (!res.ok) throw new Error(res.message);
          promptAccepted = true;
          return NextResponse.json({ success: true, data: { status: "inbox_sent", role } });
        }
        // Default delivery for an active lab worker: steer
        const res = await steerLabWorker(labPath, role, message, (body.from as string) || "human");
        if (!res.ok) throw new Error(res.error || "Failed to steer worker");
        promptAccepted = true;
        return NextResponse.json({ success: true, data: { status: "steered", role, result: res.result } });
      }
      if (body.type === "get_state") {
        const state = await labWorkerState(labPath, role);
        if (!state) {
          return NextResponse.json({ error: `Lab daemon did not report worker '${role}'` }, { status: 503 });
        }
        promptAccepted = false;
        return NextResponse.json({ success: true, data: state });
      }
      if (!LAB_LIVE_FORK_OK.has(body.type)) {
        return labWorkerProtectedError(id, role, labPath);
      }
      // Fork-family falls through to the wrapper flow: an explicit copy op.
    }

    // Fast path: already-running in-process session
    const existing = direct?.isAlive() ? direct : getRpcSession(id, cwd);
    // A lab worker transcript owned by a dead daemon is read-only (+forkable).
    // pi-web must not append turns, renames, tool pins, or compactions to a
    // session file owned by another source — fork it to chat with a copy.
    if (isLabSession(id, cwd).isLab) {
      let labFile: string | null = existing?.sessionFile || null;
      if (!labFile) labFile = await resolveSessionPath(id, cwd);
      let labHeader = null;
      if (labFile) {
        try { labHeader = readSessionHeader(labFile); } catch { labHeader = null; }
      }
      const lab = isLabSession(id, labHeader?.cwd || cwd);
      if (lab.isLab && lab.labPath && lab.role && !isDaemonAlive(lab.labPath).alive
        && !LAB_READONLY_OK.has(body.type)) {
        return NextResponse.json({
          error: `Session '${id}' belongs to lab worker '${lab.role}' whose daemon is down (${lab.labPath}). ` +
            `pi-web will not write to its transcript. Fork the session to chat with a copy, or start the lab daemon.`,
          code: "prompt_rejected",
          accepted: false,
        }, { status: 409 });
      }
    }
    if (body.type === "set_tools") {
      const filePath = existing?.sessionFile || await resolveSessionPath(id, cwd) || undefined;
      if (!existing?.isAlive() && !filePath) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      const changed = await setRpcSessionTools(id, filePath, toolNames, cwd);
      return NextResponse.json({
        success: true,
        data: { sessionId: changed.sessionId, recreated: changed.recreated },
      });
    }
    if (existing?.isAlive()) {
      const result = await existing.send(body);
      promptAccepted = body.type === "prompt";
      return NextResponse.json({ success: true, data: result });
    }

    const filePath = await resolveSessionPath(id, cwd);
    if (!filePath) {
      return NextResponse.json({
        error: "Session not found",
        ...(body.type === "prompt"
          ? { code: "prompt_rejected", accepted: false }
          : {}),
      }, { status: 404 });
    }

    // Check if this session is an active lab worker session
    const header = readSessionHeader(filePath);
    const labCheck = isLabSession(id, header?.cwd || cwd);
    if (labCheck.isLab && labCheck.labPath && labCheck.role) {
      const { alive } = isDaemonAlive(labCheck.labPath);
      if (alive) {
        if (body.type === "prompt") {
          const message = typeof body.message === "string" ? body.message : "";
          if (body.delivery === "inbox") {
            const res = await sendLabInbox(labCheck.labPath, labCheck.role, message, (body.from as string) || "human");
            if (!res.ok) throw new Error(res.message);
            promptAccepted = true;
            return NextResponse.json({ success: true, data: { status: "inbox_sent", role: labCheck.role } });
          } else {
            // Default delivery for active lab worker: steer
            const res = await steerLabWorker(labCheck.labPath, labCheck.role, message, (body.from as string) || "human");
            if (!res.ok) throw new Error(res.error || "Failed to steer worker");
            promptAccepted = true;
            return NextResponse.json({ success: true, data: { status: "steered", role: labCheck.role, result: res.result } });
          }
        } else if (body.type === "compact") {
          const ipcRes = await sendLabdIpc(labCheck.labPath, { cmd: "status" }, 1500);
          const worker = ipcRes?.workers?.[labCheck.role];
          if (worker?.busy) {
            return NextResponse.json({ error: `Cannot compact context while worker ${labCheck.role} is busy` }, { status: 409 });
          }
        }
      }
    }

    // Read-only commands never need a wrapper: with no live session (checked
    // above), answer from the file instead of attaching. get_tools and
    // get_commands still attach — they need the extension/tool registry, and
    // their callers are explicit user ops or already-running sessions.
    if (body.type === "get_state" || body.type === "get_session_stats" || body.type === "get_last_assistant_text") {
      try {
        return NextResponse.json({ success: true, data: readSessionReadOnly(filePath, id, body.type) });
      } catch (e) {
        // Fall through to the attach path, which surfaces the real error.
        console.warn(`[agent] disk read for ${body.type} failed, attaching:`, e instanceof Error ? e.message : e);
      }
    }

    const { session } = await startRpcSession(id, filePath, cwd, {
      ...(toolNames !== undefined ? { toolNames } : {}),
    });
    const result = await session.send(body);
    promptAccepted = body.type === "prompt";
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      ...(commandType === "prompt" && !promptAccepted
        ? { code: "prompt_rejected", accepted: false }
        : {}),
    }, { status: 500 });
  }
}

// Lab worker state served without attaching a web wrapper: mirrors the
// labWorker branch of GET below so views report the worker's model and
// busyness instead of a hijack wrapper's.
async function labWorkerState(labPath: string, role: string) {
  const ipcRes = await sendLabdIpc(labPath, { cmd: "status" }, 1500);
  const worker = ipcRes?.workers?.[role];
  if (!worker || !worker.alive) return null;
  return {
    isPromptRunning: worker.busy,
    isStreaming: worker.busy,
    model: worker.model ? { id: worker.model, provider: "configured" } : undefined,
    role,
    labPath,
    held: worker.held,
    parked: Boolean(worker.parked),
    parkedOn: Array.isArray(worker.parked_on) ? worker.parked_on.map(String) : undefined,
    pending: worker.pending,
  };
}

// GET /api/agent/[id] - Get current agent state
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cwd = new URL(req.url).searchParams.get("cwd") || undefined;

  try {
    const session = getRpcSession(id, cwd);
    if (session && session.isAlive()) {
      const state = await session.send({ type: "get_state" });
      return NextResponse.json({ running: true, state });
    }

    // Check if this is an active lab worker managed externally
    const filePath = await resolveSessionPath(id, cwd);
    let labCheck: { isLab: boolean; role?: string; labPath?: string } = { isLab: false };
    let labDaemonDown = false;
    if (filePath) {
      const header = readSessionHeader(filePath);
      labCheck = isLabSession(id, header?.cwd || cwd);
      if (labCheck.isLab && labCheck.labPath && labCheck.role) {
        const { alive } = isDaemonAlive(labCheck.labPath);
        labDaemonDown = !alive;
        if (alive) {
          const state = await labWorkerState(labCheck.labPath, labCheck.role);
          if (state) {
            return NextResponse.json({
              running: true,
              labWorker: true,
              state,
            });
          }
        }
      }
    }

    // A lab worker whose daemon is down is read-only in pi-web: flag it so
    // the UI can explain why the transcript can't take new turns. A live
    // daemon with a failed socket query stays unflagged (transient).
    if (labDaemonDown && labCheck.isLab && labCheck.labPath && labCheck.role) {
      return NextResponse.json({
        running: false,
        labWorker: true,
        role: labCheck.role,
        labPath: labCheck.labPath,
        readOnly: true,
      });
    }
    return NextResponse.json({ running: false });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
