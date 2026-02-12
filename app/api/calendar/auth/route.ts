import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-calendar";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  if (action === "url") {
    const url = getAuthUrl();
    return NextResponse.json({ url });
  }

  if (action === "status") {
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "google_access_token")
      .single();

    return NextResponse.json({ connected: !!data?.value });
  }

  return NextResponse.json({ error: "Invalid action. Use ?action=url or ?action=status" }, { status: 400 });
}
