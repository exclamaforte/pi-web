import { NextResponse } from "next/server";
import { getAllLabsOverview } from "@/lib/lab-service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const customPath = url.searchParams.get("path");
    const overview = await getAllLabsOverview(customPath ? [customPath] : []);
    return NextResponse.json({ success: true, data: overview });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
