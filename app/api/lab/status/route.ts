import { NextResponse } from "next/server";
import { getFullLabStatus } from "@/lib/lab-service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const labPath = url.searchParams.get("path");
    if (!labPath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    const status = await getFullLabStatus(labPath);
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
