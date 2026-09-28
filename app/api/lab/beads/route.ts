import { NextResponse } from "next/server";
import { commentBead, reviewRequestLab } from "@/lib/lab-service";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

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
        const { stdout } = await execFileAsync("bd", ["show", bdId, "--json"], {
          cwd: labPath,
          env,
          timeout: 10000,
        });
        const parsed = JSON.parse(stdout || "[]");
        return NextResponse.json({ success: true, data: Array.isArray(parsed) ? parsed[0] : parsed });
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
