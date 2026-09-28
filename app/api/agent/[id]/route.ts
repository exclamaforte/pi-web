import { NextResponse } from "next/server";
import { resolveSessionPath, readSessionHeader } from "@/lib/session-reader";
import { startRpcSession, getRpcSession, setRpcSessionTools } from "@/lib/rpc-manager";
import { isLabSession, isDaemonAlive, sendLabdIpc, steerLabWorker, sendLabInbox } from "@/lib/lab-service";

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
    if (body.type === "set_tools") {
      const filePath = existing?.sessionFile || await resolveSessionPath(id, cwd) || undefined;
      if (!existing?.isAlive() && !filePath) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      const changed = await setRpcSessionTools(id, filePath, toolNames);
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

    const { session } = await startRpcSession(id, filePath, undefined, {
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
    if (filePath) {
      const header = readSessionHeader(filePath);
      const labCheck = isLabSession(id, header?.cwd || cwd);
      if (labCheck.isLab && labCheck.labPath && labCheck.role) {
        const { alive } = isDaemonAlive(labCheck.labPath);
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
                pending: worker.pending,
              },
            });
          }
        }
      }
    }

    return NextResponse.json({ running: false });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
