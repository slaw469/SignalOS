import { NextRequest, NextResponse } from "next/server";
import { getTwitterAuthUrl } from "@/lib/twitter";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  if (action === "url") {
    const { url, codeVerifier, state } = getTwitterAuthUrl();

    // Store codeVerifier and state in settings so the callback can retrieve them
    await supabase.from("settings").upsert(
      { key: "twitter_oauth_code_verifier", value: codeVerifier, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    await supabase.from("settings").upsert(
      { key: "twitter_oauth_state", value: state, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

    return NextResponse.json({ url });
  }

  if (action === "status") {
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "twitter_access_token")
      .single();

    return NextResponse.json({ connected: !!data?.value });
  }

  return NextResponse.json(
    { error: "Invalid action. Use ?action=url or ?action=status" },
    { status: 400 }
  );
}
