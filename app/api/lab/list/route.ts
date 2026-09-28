import { NextResponse } from "next/server";
import { discoverLabs } from "@/lib/lab-service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const customPath = url.searchParams.get("path");
    const labs = discoverLabs(customPath ? [customPath] : []);
    return NextResponse.json({ success: true, data: labs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
