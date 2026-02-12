import { NextRequest, NextResponse } from "next/server";
import { getTwitterTokens } from "@/lib/twitter";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(new URL("/?error=no_code", request.url));
  }

  try {
    // Retrieve stored code verifier and state
    const { data: verifierRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "twitter_oauth_code_verifier")
      .single();

    const { data: stateRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "twitter_oauth_state")
      .single();

    if (!verifierRow?.value) {
      return NextResponse.redirect(new URL("/?error=missing_verifier", request.url));
    }

    // Validate state to prevent CSRF
    if (state && stateRow?.value && state !== stateRow.value) {
      return NextResponse.redirect(new URL("/?error=invalid_state", request.url));
    }

    const tokens = await getTwitterTokens(code, verifierRow.value);

    // Store access token
    if (tokens.accessToken) {
      const { error } = await supabase.from("settings").upsert(
        { key: "twitter_access_token", value: tokens.accessToken, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      if (error) {
        console.error("Failed to store Twitter access token:", error);
        return NextResponse.redirect(new URL("/?error=token_storage_failed", request.url));
      }
    }

    // Store refresh token
    if (tokens.refreshToken) {
      const { error } = await supabase.from("settings").upsert(
        { key: "twitter_refresh_token", value: tokens.refreshToken, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      if (error) {
        console.error("Failed to store Twitter refresh token:", error);
        return NextResponse.redirect(new URL("/?error=token_storage_failed", request.url));
      }
    }

    // Clean up OAuth temporary values
    await supabase.from("settings").delete().eq("key", "twitter_oauth_code_verifier");
    await supabase.from("settings").delete().eq("key", "twitter_oauth_state");

    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("Twitter OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=oauth_failed", request.url));
  }
}
