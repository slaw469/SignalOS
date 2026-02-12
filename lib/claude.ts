import Anthropic from "@anthropic-ai/sdk";
import type { Tool, MessageParam, ContentBlock } from "@anthropic-ai/sdk/resources/messages";

const client = new Anthropic();

const MODEL = "claude-sonnet-4-5-20250929";

export const tools: Tool[] = [
  {
    name: "add_todo",
    description:
      "Add a new todo item. Auto-tag based on context (e.g. 'school', 'startup', 'personal', 'upwork', 'doordash').",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Title of the todo" },
        description: {
          type: "string",
          description: "Optional description",
        },
        priority: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Priority level",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Tags for categorization — auto-infer from context (e.g. 'school', 'startup', 'personal', 'upwork', 'doordash')",
        },
        due_date: {
          type: "string",
          description: "Optional due date in ISO 8601 format",
        },
      },
      required: ["title", "priority"],
    },
  },
  {
    name: "update_todo",
    description: "Update an existing todo item by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        todo_id: { type: "string", description: "UUID of the todo to update" },
        title: { type: "string", description: "New title" },
        priority: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "New priority level",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "New tags",
        },
        due_date: { type: "string", description: "New due date (ISO 8601)" },
        completed: { type: "boolean", description: "Mark as completed or not" },
      },
      required: ["todo_id"],
    },
  },
  {
    name: "delete_todo",
    description: "Delete a todo item by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        todo_id: { type: "string", description: "UUID of the todo to delete" },
      },
      required: ["todo_id"],
    },
  },
  {
    name: "get_todos",
    description:
      "Get the current todo list with optional filters by tag, priority, or completion status.",
    input_schema: {
      type: "object" as const,
      properties: {
        filter_tag: {
          type: "string",
          description: "Filter by tag (e.g. 'school', 'startup')",
        },
        filter_priority: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Filter by priority",
        },
        include_completed: {
          type: "boolean",
          description: "Include completed todos (default false)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_todays_agenda",
    description:
      "Get today's calendar events from Google Calendar. Returns a list of events with times, titles, and locations.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_week_agenda",
    description:
      "Get this week's calendar events from Google Calendar. Returns all events for the current week.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "create_calendar_event",
    description: "Create a new event on Google Calendar.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Event title" },
        start_time: {
          type: "string",
          description: "Start time in ISO 8601 format",
        },
        end_time: {
          type: "string",
          description: "End time in ISO 8601 format",
        },
        description: { type: "string", description: "Optional event description" },
        location: { type: "string", description: "Optional event location" },
      },
      required: ["title", "start_time", "end_time"],
    },
  },
  {
    name: "update_calendar_event",
    description: "Update an existing Google Calendar event by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        event_id: {
          type: "string",
          description: "Google Calendar event ID",
        },
        title: { type: "string", description: "New event title" },
        start_time: {
          type: "string",
          description: "New start time (ISO 8601)",
        },
        end_time: { type: "string", description: "New end time (ISO 8601)" },
        description: { type: "string", description: "New event description" },
      },
      required: ["event_id"],
    },
  },
  {
    name: "delete_calendar_event",
    description: "Delete a Google Calendar event by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        event_id: {
          type: "string",
          description: "Google Calendar event ID to delete",
        },
      },
      required: ["event_id"],
    },
  },
];

interface CalendarEvent {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
}

function formatTime(dateStr: string | undefined): string {
  if (!dateStr) return "unknown time";
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function buildSystemPrompt(
  todos: { id: string; title: string; priority: string; tags: string[]; due_date?: string; completed: boolean }[],
  todayEvents: CalendarEvent[]
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const agendaSection =
    todayEvents.length > 0
      ? todayEvents
          .map((e) => {
            const start = formatTime(e.start?.dateTime || e.start?.date);
            const end = formatTime(e.end?.dateTime || e.end?.date);
            const loc = e.location ? ` (${e.location})` : "";
            return `- ${start} - ${end}: ${e.summary || "Untitled"}${loc}`;
          })
          .join("\n")
      : "No events scheduled for today.";

  const todoSection =
    todos.length > 0
      ? todos
          .map((t) => {
            const tags = t.tags.length > 0 ? ` [${t.tags.join(", ")}]` : "";
            const due = t.due_date
              ? ` (due: ${new Date(t.due_date).toLocaleDateString()})`
              : "";
            const status = t.completed ? " [DONE]" : "";
            return `- [${t.priority.toUpperCase()}] ${t.title}${tags}${due}${status} (id: ${t.id})`;
          })
          .join("\n")
      : "No todos.";

  return `You are SignalOS, Steven's personal AI command center. You manage his calendar and todo list.

## User Context
Steven is a CS student with lectures Tues/Thurs at 10am and 5pm. He works on a startup, takes Upwork gigs, and does DoorDash evenings. He wakes at 9am, sleeps at 1am.

## Current Date & Time
${dateStr} at ${timeStr}

## Today's Agenda
${agendaSection}

## Current Todo List
${todoSection}

## Instructions
- Auto-tag todos based on context (e.g. "meal prep" -> "personal", "leetcode" -> "school", "client project" -> "upwork").
- Be concise. Prioritize actionable responses.
- When adding todos, always infer appropriate tags and priority if the user doesn't specify.
- When referring to existing todos, use their IDs from the list above.
- For calendar operations, use ISO 8601 datetime format.`;
}

export async function sendMessage(
  messages: MessageParam[],
  systemPrompt: string
): Promise<Anthropic.Messages.Message> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    tools,
    messages,
  });

  return response;
}

export type { MessageParam, ContentBlock };
