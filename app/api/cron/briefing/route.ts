import { NextRequest, NextResponse } from "next/server";
import { generateBriefing, getTodayDateString } from "@/lib/briefing";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = getTodayDateString();
    await generateBriefing();
    return NextResponse.json({ success: true, date: today });
  } catch (err) {
    console.error("Cron briefing error:", err);
    return NextResponse.json(
      { error: `Failed to generate briefing: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
