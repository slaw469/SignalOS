import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { getCalendarEvents } from "@/lib/google-calendar";
import type { CalendarEvent, Todo } from "@/lib/types";

const MODEL = "claude-sonnet-4-5-20250929";

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

  // 3. Build the prompt
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

  const prompt = `Today is ${dateLabel}.

Here is Steven's schedule and tasks:

## Today's Calendar
${eventsText}

## Open Todos
${todosText}

Generate a concise morning briefing for Steven (2-3 sentences). Mention key events, top-priority tasks, and any scheduling notes. Be friendly but direct. Do not use bullet points — write it as a short paragraph.`;

  // 4. Call Claude
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const content = textBlock && textBlock.type === "text" ? textBlock.text : "Good morning! Have a productive day.";

  // 5. Upsert into briefings table
  const { error: upsertError } = await supabase
    .from("briefings")
    .upsert({ date: today, content }, { onConflict: "date" });

  if (upsertError) {
    console.error("Failed to upsert briefing:", upsertError);
    throw new Error(`Failed to store briefing: ${upsertError.message}`);
  }

  return { date: today, content };
}
