import { NextResponse } from "next/server";
import {
  commentBead,
  getBeadEvents,
  getBeadGraph,
  getBeadHistory,
  getBeadMemories,
  forgetBeadMemory,
  rememberBead,
  reviewRequestLab,
} from "@/lib/lab-service";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const labPath = url.searchParams.get("path");
    if (!labPath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    const view = url.searchParams.get("view");
    if (view === "memories") {
      const search = url.searchParams.get("search") || undefined;
      const memories = await getBeadMemories(labPath, search);
      return NextResponse.json({ success: true, data: memories });
    }

    if (view === "events") {
      const limit = Number(url.searchParams.get("limit")) || 60;
      const events = await getBeadEvents(labPath, limit);
      return NextResponse.json({ success: true, data: events });
    }

    const nodes = await getBeadGraph(labPath);
    return NextResponse.json({ success: true, data: nodes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action: "comment" | "approve-reproduce" | "close" | "show" | "remember" | "forget" | "history";
      path: string;
      bdId?: string;
      message?: string;
      insight?: string;
      key?: string;
    };

    const { action, path: labPath } = body;
    if (!action || !labPath) {
      return NextResponse.json({ error: "Missing required fields: action and path" }, { status: 400 });
    }

    const env = {
      ...process.env,
      PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
    };

    switch (action) {
      case "remember": {
        if (!body.insight?.trim()) {
          return NextResponse.json({ error: "Insight is required" }, { status: 400 });
        }
        const res = await rememberBead(labPath, body.insight, body.key);
        return NextResponse.json({ success: res.ok, data: res });
      }

      case "forget": {
        if (!body.key?.trim()) {
          return NextResponse.json({ error: "Key is required" }, { status: 400 });
        }
        const res = await forgetBeadMemory(labPath, body.key);
        return NextResponse.json({ success: res.ok, data: res });
      }

      case "history": {
        if (!body.bdId) {
          return NextResponse.json({ error: "bdId is required" }, { status: 400 });
        }
        const history = await getBeadHistory(labPath, body.bdId);
        return NextResponse.json({ success: true, data: history });
      }

      case "comment": {
        if (!body.bdId) {
          return NextResponse.json({ error: "bdId is required" }, { status: 400 });
        }
        if (!body.message) {
          return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }
        const res = await commentBead(labPath, body.bdId, body.message);
        return NextResponse.json({ success: res.ok, data: res });
      }

      case "approve-reproduce": {
        if (!body.bdId) {
          return NextResponse.json({ error: "bdId is required" }, { status: 400 });
        }
        const res = await reviewRequestLab(labPath, body.bdId, true);
        return NextResponse.json({ success: res.ok, data: res });
      }

      case "close": {
        if (!body.bdId) {
          return NextResponse.json({ error: "bdId is required" }, { status: 400 });
        }
        const { stdout } = await execFileAsync("bd", ["close", body.bdId], {
          cwd: labPath,
          env,
          timeout: 10000,
        });
        return NextResponse.json({ success: true, data: { message: stdout.trim() } });
      }

      case "show": {
        if (!body.bdId) {
          return NextResponse.json({ error: "bdId is required" }, { status: 400 });
        }
        const bdId = body.bdId;
        const [showRes, commentsRes] = await Promise.allSettled([
          execFileAsync("bd", ["show", bdId, "--json"], {
            cwd: labPath,
            env,
            timeout: 10000,
          }),
          execFileAsync("bd", ["comments", bdId, "--json"], {
            cwd: labPath,
            env,
            timeout: 10000,
          }),
        ]);
        if (showRes.status === "rejected") {
          throw showRes.reason;
        }
        const parsed = JSON.parse(showRes.value.stdout || "[]");
        const bead = Array.isArray(parsed) ? parsed[0] : parsed;
        if (bead && typeof bead === "object") {
          if (commentsRes.status === "fulfilled") {
            try {
              const comments = JSON.parse(commentsRes.value.stdout || "[]");
              if (Array.isArray(comments)) {
                bead.comments = comments;
              }
            } catch {
              // Ignore comments parse errors
            }
          }
        }
        return NextResponse.json({ success: true, data: bead });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

