import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getTodayDateString, generateBriefing } from "@/lib/briefing";

export async function GET() {
  try {
    const today = getTodayDateString();

    // Check if today's briefing already exists
    const { data: existing, error: fetchError } = await supabase
      .from("briefings")
      .select("*")
      .eq("date", today)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      // PGRST116 = "no rows returned" — that's expected when no briefing exists
      console.error("Failed to fetch briefing:", fetchError);
      return NextResponse.json({ error: "Failed to fetch briefing" }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json({ briefing: existing });
    }

    // No briefing for today — generate one
    const briefing = await generateBriefing();
    return NextResponse.json({ briefing });
  } catch (err) {
    console.error("Briefing GET error:", err);
    return NextResponse.json(
      { error: `Failed to get briefing: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const briefing = await generateBriefing();
    return NextResponse.json({ briefing });
  } catch (err) {
    console.error("Briefing POST error:", err);
    return NextResponse.json(
      { error: `Failed to generate briefing: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
