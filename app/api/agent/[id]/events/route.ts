import { createAgentEventStream } from "@/lib/agent-event-stream";
import { resolveSessionPath, readSessionHeader, listAllSessions } from "@/lib/session-reader";
import { isLabSession, isDaemonAlive, LAB_SESSION_ID_PATTERN } from "@/lib/lab-service";
import { getRpcSession, startRpcSession } from "@/lib/rpc-manager";

export const dynamic = "force-dynamic";

// A live lab worker owns its transcript: opening its event stream must not
// attach a web wrapper (that wrapper would hijack later prompts with the
// web's model). Serve an inert but healthy stream instead: `connected` with
// isStreaming false satisfies the client's readiness handshake, heartbeats
// keep it open, and no retry storm follows. Live updates for workers come
// from the Lab view, not this stream.
function labWorkerEventStream(sessionId: string, note: string): Response {
  const payload = JSON.stringify({
    type: "connected",
    sessionId,
    isStreaming: false,
    labWorker: true,
    note,
  });
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":\n\n"));
        } catch { /* client went away; cancel() cleans up */ }
      }, 25000);
    },
    cancel() {
      if (heartbeat !== null) clearInterval(heartbeat);
      heartbeat = null;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// GET /api/agent/[id]/events - SSE stream of agent events
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (req.signal.aborted) return new Response(null, { status: 204 });
  const cwd = new URL(req.url).searchParams.get("cwd") || undefined;

  // A bare `lab-<role>` id with no cwd is ambiguous across labs: serve the
  // inert stream instead of guessing which worker's transcript to attach to.
  if (!cwd && LAB_SESSION_ID_PATTERN.test(id)) {
    const candidates = (await listAllSessions()).filter((s) => s.id === id);
    if (candidates.length > 1) {
      return labWorkerEventStream(id, "ambiguous lab session id: open it from the Lab view");
    }
  }

  const filePath = await resolveSessionPath(id, cwd);
  if (filePath) {
    let header = null;
    try { header = readSessionHeader(filePath); } catch { header = null; }
    const lab = isLabSession(id, header?.cwd || cwd);
    if (lab.isLab && lab.labPath && lab.role && isDaemonAlive(lab.labPath).alive) {
      return labWorkerEventStream(id, `live lab worker '${lab.role}': use the Lab view`);
    }
  }

  // Fast path: already-running session
  const session = getRpcSession(id, cwd);
  let sessionPromise;
  if (session?.isAlive()) {
    sessionPromise = Promise.resolve(session);
  } else {
    if (!filePath) {
      return new Response("Session not found", { status: 404 });
    }
    if (req.signal.aborted) return new Response(null, { status: 204 });
    sessionPromise = startRpcSession(id, filePath, cwd).then((result) => result.session);
  }

  const stream = createAgentEventStream(req, id, sessionPromise);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
