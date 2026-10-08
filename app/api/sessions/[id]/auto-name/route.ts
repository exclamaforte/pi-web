import { NextResponse } from "next/server";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { generateSessionTitle } from "@/lib/session-title";
import { getRpcSession, startRpcSession } from "@/lib/rpc-manager";
import { invalidateSessionListCache, resolveSessionPath, readSessionHeader } from "@/lib/session-reader";
import { isLabSession, isDaemonAlive } from "@/lib/lab-service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cwd = new URL(req.url).searchParams.get("cwd") || undefined;

  try {
    const filePath = await resolveSessionPath(id, cwd);
    if (!filePath) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Auto-naming runs the wrapper's model and renames the transcript: never
    // do either to a live lab worker's file.
    let header = null;
    try { header = readSessionHeader(filePath); } catch { header = null; }
    const lab = isLabSession(id, header?.cwd || cwd);
    if (lab.isLab && lab.labPath && lab.role && isDaemonAlive(lab.labPath).alive) {
      return NextResponse.json({
        error: `Session '${id}' belongs to live lab worker '${lab.role}' (${lab.labPath}). ` +
          `pi-web will not attach to or write its transcript.`,
        code: "lab_worker_protected",
      }, { status: 409 });
    }

    const existing = getRpcSession(id, cwd);
    const { session } = existing?.isAlive()
      ? { session: existing }
      : await startRpcSession(id, filePath, cwd);

    // globalThis keeps wrappers alive across dev hot reloads; older instances
    // may predate waitUntilReady(), but those have already completed startup.
    await session.waitUntilReady?.();
    const result = await generateSessionTitle(session.inner as unknown as AgentSession);

    if (!session.isAlive()) {
      return NextResponse.json(
        { error: "The session was closed while its title was being generated. Please try again." },
        { status: 409 },
      );
    }

    session.inner.setSessionName(result.title);
    invalidateSessionListCache();
    return NextResponse.json({ title: result.title, usage: result.usage ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
