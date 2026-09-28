import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const labPath = url.searchParams.get("path");
    const expId = url.searchParams.get("id");

    if (!labPath || !expId) {
      return NextResponse.json({ error: "Missing path or id parameter" }, { status: 400 });
    }

    const expDir = join(labPath, "experiments", expId);
    if (!existsSync(expDir)) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    const readFileSafe = (filename: string, maxBytes = 50000): string | null => {
      const p = join(expDir, filename);
      if (!existsSync(p)) return null;
      try {
        const content = readFileSync(p, "utf8");
        return content.length > maxBytes ? content.slice(-maxBytes) : content;
      } catch {
        return null;
      }
    };

    let metrics: any = null;
    const metricsRaw = readFileSafe("metrics.json");
    if (metricsRaw) {
      try {
        metrics = JSON.parse(metricsRaw);
      } catch {
        metrics = metricsRaw;
      }
    }

    let job: any = null;
    const jobRaw = readFileSafe("job.json");
    if (jobRaw) {
      try {
        job = JSON.parse(jobRaw);
      } catch {
        job = jobRaw;
      }
    }

    const outputLog = readFileSafe("output.log");
    const runSh = readFileSafe("run.sh");

    return NextResponse.json({
      success: true,
      data: {
        id: expId,
        metrics,
        job,
        outputLog,
        runSh,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
