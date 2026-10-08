import { NextResponse } from "next/server";
import { getWorkerTimeline } from "@/lib/lab-service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const labPath = url.searchParams.get("path");
    if (!labPath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 1500, 1), 5000) : 1500;
    const samples = getWorkerTimeline(labPath, limit);
    return NextResponse.json({ success: true, data: samples });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
