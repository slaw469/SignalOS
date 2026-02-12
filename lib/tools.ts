import { supabase } from "@/lib/supabase";
import {
  getCalendarEvents,
  createCalendarEvent as gcalCreate,
  updateCalendarEvent as gcalUpdate,
  deleteCalendarEvent as gcalDelete,
} from "@/lib/google-calendar";

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// --- Token Helper ---

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "google_access_token")
    .single();
  if (error && error.code !== "PGRST116") {
    throw new Error("Database error retrieving access token");
  }
  return data?.value ?? null;
}

// --- Todo Handlers ---

async function addTodo(input: {
  title: string;
  description?: string;
  priority: string;
  tags?: string[];
  due_date?: string;
}): Promise<ToolResult> {
  const { data, error } = await supabase
    .from("todos")
    .insert({
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      tags: input.tags ?? [],
      due_date: input.due_date ?? null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

async function updateTodo(input: {
  todo_id: string;
  title?: string;
  priority?: string;
  tags?: string[];
  due_date?: string;
  completed?: boolean;
}): Promise<ToolResult> {
  const { todo_id, ...fields } = input;
  const updates: Record<string, unknown> = {};

  if (fields.title !== undefined) updates.title = fields.title;
  if (fields.priority !== undefined) updates.priority = fields.priority;
  if (fields.tags !== undefined) updates.tags = fields.tags;
  if (fields.due_date !== undefined) updates.due_date = fields.due_date;
  if (fields.completed !== undefined) updates.completed = fields.completed;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("todos")
    .update(updates)
    .eq("id", todo_id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Todo not found" };
  return { success: true, data };
}

async function deleteTodo(input: { todo_id: string }): Promise<ToolResult> {
  const { error, count } = await supabase
    .from("todos")
    .delete({ count: "exact" })
    .eq("id", input.todo_id);

  if (error) return { success: false, error: error.message };
  if (count === 0) return { success: false, error: "Todo not found" };
  return { success: true, data: { deleted: input.todo_id } };
}

async function getTodos(input: {
  filter_tag?: string;
  filter_priority?: string;
  include_completed?: boolean;
}): Promise<ToolResult> {
  let query = supabase.from("todos").select("*");

  if (!input.include_completed) {
    query = query.eq("completed", false);
  }

  if (input.filter_priority) {
    query = query.eq("priority", input.filter_priority);
  }

  if (input.filter_tag) {
    query = query.contains("tags", [input.filter_tag]);
  }

  const { data, error } = await query.order("created_at", {
    ascending: false,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// --- Calendar Handlers ---

const CALENDAR_NOT_CONNECTED =
  "Google Calendar is not connected. Please connect Google Calendar in settings first.";

async function getTodaysAgenda(): Promise<ToolResult> {
  const token = await getAccessToken();
  if (!token) return { success: false, error: CALENDAR_NOT_CONNECTED };

  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const events = await getCalendarEvents(token, startOfDay, endOfDay);
    return { success: true, data: events };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch today's events: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function getWeekAgenda(): Promise<ToolResult> {
  const token = await getAccessToken();
  if (!token) return { success: false, error: CALENDAR_NOT_CONNECTED };

  try {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - dayOfWeek));
    const events = await getCalendarEvents(token, startOfWeek.toISOString(), endOfWeek.toISOString());
    return { success: true, data: events };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch week events: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function createCalendarEvent(input: {
  title: string;
  start_time: string;
  end_time: string;
  description?: string;
  location?: string;
}): Promise<ToolResult> {
  const token = await getAccessToken();
  if (!token) return { success: false, error: CALENDAR_NOT_CONNECTED };

  try {
    const event = await gcalCreate(token, {
      title: input.title,
      start_time: input.start_time,
      end_time: input.end_time,
      description: input.description,
      location: input.location,
    });
    return { success: true, data: event };
  } catch (err) {
    return {
      success: false,
      error: `Failed to create event: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function updateCalendarEvent(input: {
  event_id: string;
  title?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
}): Promise<ToolResult> {
  const token = await getAccessToken();
  if (!token) return { success: false, error: CALENDAR_NOT_CONNECTED };

  try {
    const updates: { title?: string; start_time?: string; end_time?: string; description?: string } = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.start_time !== undefined) updates.start_time = input.start_time;
    if (input.end_time !== undefined) updates.end_time = input.end_time;
    if (input.description !== undefined) updates.description = input.description;

    const event = await gcalUpdate(token, input.event_id, updates);
    return { success: true, data: event };
  } catch (err) {
    return {
      success: false,
      error: `Failed to update event: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function deleteCalendarEvent(input: {
  event_id: string;
}): Promise<ToolResult> {
  const token = await getAccessToken();
  if (!token) return { success: false, error: CALENDAR_NOT_CONNECTED };

  try {
    await gcalDelete(token, input.event_id);
    return { success: true, data: { deleted: input.event_id } };
  } catch (err) {
    return {
      success: false,
      error: `Failed to delete event: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// --- Main Router ---

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<ToolResult> {
  switch (toolName) {
    case "add_todo":
      return addTodo(toolInput as Parameters<typeof addTodo>[0]);
    case "update_todo":
      return updateTodo(toolInput as Parameters<typeof updateTodo>[0]);
    case "delete_todo":
      return deleteTodo(toolInput as Parameters<typeof deleteTodo>[0]);
    case "get_todos":
      return getTodos(toolInput as Parameters<typeof getTodos>[0]);
    case "get_todays_agenda":
      return getTodaysAgenda();
    case "get_week_agenda":
      return getWeekAgenda();
    case "create_calendar_event":
      return createCalendarEvent(
        toolInput as Parameters<typeof createCalendarEvent>[0]
      );
    case "update_calendar_event":
      return updateCalendarEvent(
        toolInput as Parameters<typeof updateCalendarEvent>[0]
      );
    case "delete_calendar_event":
      return deleteCalendarEvent(
        toolInput as Parameters<typeof deleteCalendarEvent>[0]
      );
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}
