import { NextResponse } from "next/server";
import {
  steerLabWorker,
  sendLabInbox,
  restartLabRoles,
  spawnLab,
  stopLab,
  reviewRequestLab,
  getDaemonLogTail,
} from "@/lib/lab-service";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action: string;
      path: string;
      role?: string;
      message?: string;
      from?: string;
      roles?: string[];
      host?: string;
      model?: string;
      bdId?: string;
      reproduce?: boolean;
    };

    const { action, path: labPath } = body;
    if (!action || !labPath) {
      return NextResponse.json({ error: "Missing action or path" }, { status: 400 });
    }

    switch (action) {
      case "steer": {
        if (!body.role || !body.message) {
          return NextResponse.json({ error: "Missing role or message for steer" }, { status: 400 });
        }
        const res = await steerLabWorker(labPath, body.role, body.message, body.from || "human");
        return NextResponse.json({ success: res.ok, data: res });
      }

      case "send": {
        if (!body.role || !body.message) {
          return NextResponse.json({ error: "Missing role or message for send" }, { status: 400 });
        }
        const res = await sendLabInbox(labPath, body.role, body.message, body.from || "human");
        return NextResponse.json({ success: res.ok, data: res });
      }

      case "restart": {
        const res = await restartLabRoles(labPath, body.roles);
        return NextResponse.json({ success: res.ok, data: res });
      }

      case "spawn": {
        const res = await spawnLab(labPath, { host: body.host, model: body.model });
        return NextResponse.json({ success: res.ok, data: res });
      }

      case "stop": {
        const res = await stopLab(labPath);
        return NextResponse.json({ success: res.ok, data: res });
      }

      case "review-request": {
        if (!body.bdId) {
          return NextResponse.json({ error: "Missing bdId" }, { status: 400 });
        }
        const res = await reviewRequestLab(labPath, body.bdId, !!body.reproduce);
        return NextResponse.json({ success: res.ok, data: res });
      }

      case "logs": {
        const logs = getDaemonLogTail(labPath, 150);
        return NextResponse.json({ success: true, data: { logs } });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
