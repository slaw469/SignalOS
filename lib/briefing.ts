import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "@/lib/supabase";
import { getCalendarEvents } from "@/lib/google-calendar";
import type { CalendarEvent, Todo, Tweet } from "@/lib/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const MODEL = "gemini-2.0-flash";

export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "unknown time";
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export async function generateBriefing(): Promise<{ date: string; content: string }> {
  const today = getTodayDateString();
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 1. Fetch open todos
  const { data: todos } = await supabase
    .from("todos")
    .select("id, title, priority, tags, due_date, completed")
    .eq("completed", false)
    .order("created_at", { ascending: false });

  const openTodos = (todos ?? []) as Pick<Todo, "id" | "title" | "priority" | "tags" | "due_date" | "completed">[];

  // 2. Fetch today's calendar events (skip if Google not connected)
  let todayEvents: CalendarEvent[] = [];
  try {
    const { data: tokenRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "google_access_token")
      .single();

    if (tokenRow?.value) {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      todayEvents = await getCalendarEvents(tokenRow.value, startOfDay, endOfDay);
    }
  } catch {
    // Google Calendar not connected — skip events
  }

  // 3. Fetch tweet queue (drafts + scheduled for today)
  const startOfDayISO = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDayISO = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  const { data: tweetDrafts } = await supabase
    .from("tweets")
    .select("id, content, status, scheduled_at, thread_id")
    .eq("status", "draft")
    .order("created_at", { ascending: false });

  const { data: tweetScheduled } = await supabase
    .from("tweets")
    .select("id, content, status, scheduled_at, thread_id")
    .eq("status", "scheduled")
    .gte("scheduled_at", startOfDayISO)
    .lt("scheduled_at", endOfDayISO)
    .order("scheduled_at", { ascending: true });

  const drafts = (tweetDrafts ?? []) as Pick<Tweet, "id" | "content" | "status" | "scheduled_at" | "thread_id">[];
  const scheduledToday = (tweetScheduled ?? []) as Pick<Tweet, "id" | "content" | "status" | "scheduled_at" | "thread_id">[];

  // 4. Build the prompt
  const eventsText =
    todayEvents.length > 0
      ? todayEvents
          .map((e) => {
            const start = formatTime(e.start?.dateTime || e.start?.date);
            const end = formatTime(e.end?.dateTime || e.end?.date);
            const loc = e.location ? ` at ${e.location}` : "";
            return `- ${start} - ${end}: ${e.summary || "Untitled"}${loc}`;
          })
          .join("\n")
      : "No events scheduled.";

  const todosText =
    openTodos.length > 0
      ? openTodos
          .map((t) => {
            const tags = t.tags.length > 0 ? ` [${t.tags.join(", ")}]` : "";
            const due = t.due_date ? ` (due: ${new Date(t.due_date).toLocaleDateString()})` : "";
            return `- [${t.priority.toUpperCase()}] ${t.title}${tags}${due}`;
          })
          .join("\n")
      : "No open todos.";

  const tweetsText = (() => {
    const lines: string[] = [];
    if (drafts.length > 0) {
      lines.push(`${drafts.length} draft${drafts.length === 1 ? "" : "s"} in queue:`);
      for (const d of drafts.slice(0, 5)) {
        lines.push(`  - "${d.content.slice(0, 80)}${d.content.length > 80 ? "..." : ""}"`);
      }
    }
    if (scheduledToday.length > 0) {
      lines.push(`${scheduledToday.length} scheduled for today:`);
      for (const s of scheduledToday) {
        const time = s.scheduled_at ? formatTime(s.scheduled_at) : "TBD";
        lines.push(`  - ${time}: "${s.content.slice(0, 80)}${s.content.length > 80 ? "..." : ""}"`);
      }
    }
    return lines.length > 0 ? lines.join("\n") : "No tweets in queue.";
  })();

  const prompt = `Today is ${dateLabel}.

Here is Steven's schedule and tasks:

## Today's Calendar
${eventsText}

## Open Todos
${todosText}

## Tweet Queue
${tweetsText}

Generate a concise morning briefing for Steven (2-3 sentences). Mention key events, top-priority tasks, and any scheduling notes. Be friendly but direct. Do not use bullet points — write it as a short paragraph.

Then, under a "Tweet ideas" heading, suggest 2-3 tweet ideas based on what Steven is working on today. Keep them casual and authentic. Each tweet idea should be under 280 characters.`;

  // 5. Call Gemini
  const model = genAI.getGenerativeModel({ model: MODEL });
  const result = await model.generateContent(prompt);
  const content = result.response.text() || "Good morning! Have a productive day.";

  // 6. Upsert into briefings table
  const { error: upsertError } = await supabase
    .from("briefings")
    .upsert({ date: today, content }, { onConflict: "date" });

  if (upsertError) {
    console.error("Failed to upsert briefing:", upsertError);
    throw new Error(`Failed to store briefing: ${upsertError.message}`);
  }

  return { date: today, content };
}
