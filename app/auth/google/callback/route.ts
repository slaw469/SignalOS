import { NextRequest, NextResponse } from "next/server";
import { getTokensFromCode } from "@/lib/google-calendar";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/?error=no_code", request.url));
  }

  try {
    const tokens = await getTokensFromCode(code);

    if (tokens.access_token) {
      await supabase.from("settings").upsert(
        { key: "google_access_token", value: tokens.access_token, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    }

    if (tokens.refresh_token) {
      await supabase.from("settings").upsert(
        { key: "google_refresh_token", value: tokens.refresh_token, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    }

    if (tokens.expiry_date) {
      await supabase.from("settings").upsert(
        { key: "google_token_expiry", value: String(tokens.expiry_date), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    }

    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=oauth_failed", request.url));
  }
}
