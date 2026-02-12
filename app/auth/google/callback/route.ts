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
      const { error } = await supabase.from("settings").upsert(
        { key: "google_access_token", value: tokens.access_token, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      if (error) {
        console.error("Failed to store access token:", error);
        return NextResponse.redirect(new URL("/?error=token_storage_failed", request.url));
      }
    }

    if (tokens.refresh_token) {
      const { error } = await supabase.from("settings").upsert(
        { key: "google_refresh_token", value: tokens.refresh_token, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      if (error) {
        console.error("Failed to store refresh token:", error);
        return NextResponse.redirect(new URL("/?error=token_storage_failed", request.url));
      }
    }

    if (tokens.expiry_date) {
      const { error } = await supabase.from("settings").upsert(
        { key: "google_token_expiry", value: String(tokens.expiry_date), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      if (error) {
        console.error("Failed to store token expiry:", error);
        return NextResponse.redirect(new URL("/?error=token_storage_failed", request.url));
      }
    }

    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=oauth_failed", request.url));
  }
}
