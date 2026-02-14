import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  getCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  refreshAccessToken,
} from "@/lib/google-calendar";

async function getTokens() {
  const { data: accessRow, error: accessError } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "google_access_token")
    .single();

  if (accessError && accessError.code !== "PGRST116") {
    throw new Error("Database error retrieving access token");
  }

  const { data: refreshRow, error: refreshError } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "google_refresh_token")
    .single();

  if (refreshError && refreshError.code !== "PGRST116") {
    throw new Error("Database error retrieving refresh token");
  }

  return {
    accessToken: accessRow?.value ?? null,
    refreshToken: refreshRow?.value ?? null,
  };
}

async function getValidAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken } = await getTokens();
  if (!accessToken) return null;

  // Check if token expiry is stored and if it's expired
  const { data: expiryRow } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "google_token_expiry")
    .single();

  const expiry = expiryRow?.value ? Number(expiryRow.value) : 0;
  const isExpired = expiry > 0 && Date.now() >= expiry;

  if (isExpired && refreshToken) {
    return await doRefresh(refreshToken);
  }

  return accessToken;
}

async function doRefresh(refreshToken: string): Promise<string | null> {
  try {
    const credentials = await refreshAccessToken(refreshToken);
    if (credentials.access_token) {
      const { error } = await supabase.from("settings").upsert(
        { key: "google_access_token", value: credentials.access_token, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      if (error) {
        console.warn("Failed to persist refreshed access token to DB:", error);
      }
    }
    if (credentials.expiry_date) {
      const { error } = await supabase.from("settings").upsert(
        { key: "google_token_expiry", value: String(credentials.expiry_date), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      if (error) {
        console.warn("Failed to persist token expiry to DB:", error);
      }
    }
    return credentials.access_token ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  let accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Not connected to Google Calendar" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  // Calculate "today" in user's timezone to avoid UTC offset issues on Vercel
  const userTz = "America/Chicago";
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: userTz }); // "YYYY-MM-DD"

  // Get the current UTC offset for the user's timezone (handles DST automatically)
  // Format gives something like "GMT-6" (CST) or "GMT-5" (CDT)
  const offsetStr = new Intl.DateTimeFormat("en-US", { timeZone: userTz, timeZoneName: "shortOffset" })
    .formatToParts(now)
    .find(p => p.type === "timeZoneName")?.value || "GMT-6";
  const match = offsetStr.match(/GMT([+-]?)(\d+)/);
  const sign = match?.[1] === "+" ? "+" : "-";
  const hours = (match?.[2] || "6").padStart(2, "0");
  const tzOffset = `${sign}${hours}:00`; // e.g. "-06:00" or "-05:00"

  // Build RFC3339 timestamps with explicit timezone offset
  // Google Calendar API accepts these directly — no round-trip conversion needed
  const timeMin = startParam ?? `${todayStr}T00:00:00${tzOffset}`;
  const timeMax = endParam ?? `${todayStr}T23:59:59${tzOffset}`;

  try {
    const events = await getCalendarEvents(accessToken, timeMin, timeMax);
    return NextResponse.json({ events });
  } catch (error: unknown) {
    // Auto-refresh on 401 from Google
    const status = (error as { code?: number })?.code;
    if (status === 401) {
      const { refreshToken } = await getTokens();
      if (refreshToken) {
        accessToken = await doRefresh(refreshToken);
        if (accessToken) {
          try {
            const events = await getCalendarEvents(accessToken, timeMin, timeMax);
            return NextResponse.json({ events });
          } catch (retryError) {
            console.error("Calendar retry after refresh failed:", retryError);
            return NextResponse.json({ error: "Failed to fetch events after token refresh" }, { status: 500 });
          }
        }
      }
      return NextResponse.json({ error: "Token expired and refresh failed" }, { status: 401 });
    }
    console.error("Calendar GET error:", error);
    return NextResponse.json({ error: "Failed to fetch calendar events" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Not connected to Google Calendar" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, start_time, end_time, description, location } = body;

    if (!title || !start_time || !end_time) {
      return NextResponse.json({ error: "title, start_time, and end_time are required" }, { status: 400 });
    }

    const event = await createCalendarEvent(accessToken, {
      title,
      start_time,
      end_time,
      description,
      location,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("Calendar POST error:", error);
    return NextResponse.json({ error: "Failed to create calendar event" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Not connected to Google Calendar" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { event_id, title, start_time, end_time, description } = body;

    if (!event_id) {
      return NextResponse.json({ error: "event_id is required" }, { status: 400 });
    }

    const event = await updateCalendarEvent(accessToken, event_id, {
      title,
      start_time,
      end_time,
      description,
    });
    return NextResponse.json({ event });
  } catch (error) {
    console.error("Calendar PATCH error:", error);
    return NextResponse.json({ error: "Failed to update calendar event" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Not connected to Google Calendar" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { event_id } = body;

    if (!event_id) {
      return NextResponse.json({ error: "event_id is required" }, { status: 400 });
    }

    await deleteCalendarEvent(accessToken, event_id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Calendar DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete calendar event" }, { status: 500 });
  }
}
