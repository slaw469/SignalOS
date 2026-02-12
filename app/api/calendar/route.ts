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
  const { data: accessRow } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "google_access_token")
    .single();

  const { data: refreshRow } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "google_refresh_token")
    .single();

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
      await supabase.from("settings").upsert(
        { key: "google_access_token", value: credentials.access_token, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    }
    if (credentials.expiry_date) {
      await supabase.from("settings").upsert(
        { key: "google_token_expiry", value: String(credentials.expiry_date), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
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

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const timeMin = startParam ?? startOfDay.toISOString();
  const timeMax = endParam ?? endOfDay.toISOString();

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
          const events = await getCalendarEvents(accessToken, timeMin, timeMax);
          return NextResponse.json({ events });
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
