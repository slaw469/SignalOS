import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { refreshTwitterToken } from "@/lib/twitter";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, string> = {};

  // --- Refresh Twitter OAuth2 token ---
  try {
    const { data: refreshRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "twitter_refresh_token")
      .single();

    if (refreshRow?.value) {
      const refreshed = await refreshTwitterToken(refreshRow.value);
      const now = new Date().toISOString();

      await supabase.from("settings").upsert(
        { key: "twitter_access_token", value: refreshed.accessToken, updated_at: now },
        { onConflict: "key" }
      );
      if (refreshed.refreshToken) {
        await supabase.from("settings").upsert(
          { key: "twitter_refresh_token", value: refreshed.refreshToken, updated_at: now },
          { onConflict: "key" }
        );
      }
      results.twitter = "refreshed";
    } else {
      results.twitter = "skipped (no refresh token)";
    }
  } catch (err) {
    console.error("Twitter token refresh failed:", err);
    results.twitter = `failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  // --- Refresh Google OAuth2 token (if applicable) ---
  try {
    const { data: googleRefreshRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "google_refresh_token")
      .single();

    if (googleRefreshRow?.value) {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: googleRefreshRow.value,
          grant_type: "refresh_token",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const now = new Date().toISOString();
        await supabase.from("settings").upsert(
          { key: "google_access_token", value: data.access_token, updated_at: now },
          { onConflict: "key" }
        );
        results.google = "refreshed";
      } else {
        const errData = await res.json().catch(() => ({}));
        results.google = `failed: ${errData.error || res.status}`;
      }
    } else {
      results.google = "skipped (no refresh token)";
    }
  } catch (err) {
    console.error("Google token refresh failed:", err);
    results.google = `failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json({ success: true, results });
}
