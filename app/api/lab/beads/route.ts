import { NextResponse } from "next/server";
import { commentBead, getBeadGraph, reviewRequestLab } from "@/lib/lab-service";
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
      action: "comment" | "approve-reproduce" | "close" | "show";
      path: string;
      bdId: string;
      message?: string;
    };

    const { action, path: labPath, bdId } = body;
    if (!action || !labPath || !bdId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const env = {
      ...process.env,
      PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH || ""}`,
    };

    switch (action) {
      case "comment": {
        if (!body.message) {
          return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }
        const res = await commentBead(labPath, bdId, body.message);
        return NextResponse.json({ success: res.ok, data: res });
      }

      case "approve-reproduce": {
        const res = await reviewRequestLab(labPath, bdId, true);
        return NextResponse.json({ success: res.ok, data: res });
      }

      case "close": {
        const { stdout } = await execFileAsync("bd", ["close", bdId], {
          cwd: labPath,
          env,
          timeout: 10000,
        });
        return NextResponse.json({ success: true, data: { message: stdout.trim() } });
      }

      case "show": {
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
