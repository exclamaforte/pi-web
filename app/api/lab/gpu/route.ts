import { NextResponse } from "next/server";
import { cancelGpuJob, getGpuJobLogs, getGpuQueueStatus } from "@/lib/lab-service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");

    if (jobId) {
      const logs = await getGpuJobLogs(jobId);
      return NextResponse.json({ success: true, data: { jobId, logs } });
    }

    const status = await getGpuQueueStatus();
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { jobId: string; action: "cancel" };
    if (!body.jobId || body.action !== "cancel") {
      return NextResponse.json({ error: "Missing jobId or invalid action" }, { status: 400 });
    }

    const res = await cancelGpuJob(body.jobId);
    return NextResponse.json({ success: res.ok, data: res });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
