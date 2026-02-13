import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedBlueskyAgent } from "@/lib/bluesky";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  if (action === "status") {
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "bluesky_session")
      .single();

    if (!data?.value) {
      return NextResponse.json({ connected: false });
    }

    // Verify the session is still valid by attempting to resume it
    const agent = await getAuthenticatedBlueskyAgent();
    return NextResponse.json({
      connected: !!agent,
      handle: agent?.session?.handle ?? null,
    });
  }

  if (action === "connect") {
    if (!process.env.BLUESKY_IDENTIFIER || !process.env.BLUESKY_APP_PASSWORD) {
      return NextResponse.json(
        { error: "BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD env vars are required" },
        { status: 500 }
      );
    }

    const agent = await getAuthenticatedBlueskyAgent();
    if (!agent) {
      return NextResponse.json(
        { error: "Failed to authenticate with Bluesky. Check credentials." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      connected: true,
      handle: agent.session?.handle ?? null,
    });
  }

  return NextResponse.json(
    { error: "Invalid action. Use ?action=status or ?action=connect" },
    { status: 400 }
  );
}
