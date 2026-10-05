import { NextResponse } from "next/server";
import { resolveSessionPath, readSessionHeader } from "@/lib/session-reader";
import { startRpcSession, getRpcSession, setRpcSessionTools } from "@/lib/rpc-manager";
import { isLabSession, isDaemonAlive, sendLabdIpc, steerLabWorker, sendLabInbox } from "@/lib/lab-service";

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

    // Fast path: already-running in-process session
    const existing = getRpcSession(id, cwd);
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
          const ipcRes = await sendLabdIpc(labCheck.labPath, { cmd: "status" }, 1500);
          const worker = ipcRes?.workers?.[labCheck.role];
          if (worker && worker.alive) {
            return NextResponse.json({
              running: true,
              labWorker: true,
              state: {
                isPromptRunning: worker.busy,
                isStreaming: worker.busy,
                model: worker.model ? { id: worker.model, provider: "configured" } : undefined,
                role: labCheck.role,
                labPath: labCheck.labPath,
                held: worker.held,
                parked: Boolean(worker.parked),
                pending: worker.pending,
              },
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
