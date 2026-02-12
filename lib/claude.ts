import { GoogleGenerativeAI, SchemaType, type FunctionDeclarationsTool } from "@google/generative-ai";
import type { CalendarEvent, Tweet } from "@/lib/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MODEL = "gemini-2.0-flash";

export const geminiTools: FunctionDeclarationsTool[] = [
  {
    functionDeclarations: [
      {
        name: "add_todo",
        description:
          "Add a new todo item. Auto-tag based on context (e.g. 'school', 'startup', 'personal', 'upwork', 'doordash').",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING, description: "Title of the todo" },
            description: { type: SchemaType.STRING, description: "Optional description" },
            priority: {
              type: SchemaType.STRING,
              format: "enum",
              enum: ["high", "medium", "low"],
              description: "Priority level",
            },
            tags: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
              description:
                "Tags for categorization — auto-infer from context (e.g. 'school', 'startup', 'personal', 'upwork', 'doordash')",
            },
            due_date: {
              type: SchemaType.STRING,
              description: "Optional due date in ISO 8601 format",
            },
          },
          required: ["title", "priority"],
        },
      },
      {
        name: "update_todo",
        description: "Update an existing todo item by ID.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            todo_id: { type: SchemaType.STRING, description: "UUID of the todo to update" },
            title: { type: SchemaType.STRING, description: "New title" },
            priority: {
              type: SchemaType.STRING,
              format: "enum",
              enum: ["high", "medium", "low"],
              description: "New priority level",
            },
            tags: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
              description: "New tags",
            },
            due_date: { type: SchemaType.STRING, description: "New due date (ISO 8601)" },
            completed: { type: SchemaType.BOOLEAN, description: "Mark as completed or not" },
          },
          required: ["todo_id"],
        },
      },
      {
        name: "delete_todo",
        description: "Delete a todo item by ID.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            todo_id: { type: SchemaType.STRING, description: "UUID of the todo to delete" },
          },
          required: ["todo_id"],
        },
      },
      {
        name: "get_todos",
        description:
          "Get the current todo list with optional filters by tag, priority, or completion status.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            filter_tag: {
              type: SchemaType.STRING,
              description: "Filter by tag (e.g. 'school', 'startup')",
            },
            filter_priority: {
              type: SchemaType.STRING,
              format: "enum",
              enum: ["high", "medium", "low"],
              description: "Filter by priority",
            },
            include_completed: {
              type: SchemaType.BOOLEAN,
              description: "Include completed todos (default false)",
            },
          },
        },
      },
      {
        name: "get_todays_agenda",
        description:
          "Get today's calendar events from Google Calendar. Returns a list of events with times, titles, and locations.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {},
        },
      },
      {
        name: "get_week_agenda",
        description:
          "Get this week's calendar events from Google Calendar. Returns all events for the current week.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {},
        },
      },
      {
        name: "create_calendar_event",
        description: "Create a new event on Google Calendar.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING, description: "Event title" },
            start_time: {
              type: SchemaType.STRING,
              description: "Start time in ISO 8601 format",
            },
            end_time: {
              type: SchemaType.STRING,
              description: "End time in ISO 8601 format",
            },
            description: { type: SchemaType.STRING, description: "Optional event description" },
            location: { type: SchemaType.STRING, description: "Optional event location" },
          },
          required: ["title", "start_time", "end_time"],
        },
      },
      {
        name: "update_calendar_event",
        description: "Update an existing Google Calendar event by ID.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            event_id: {
              type: SchemaType.STRING,
              description: "Google Calendar event ID",
            },
            title: { type: SchemaType.STRING, description: "New event title" },
            start_time: {
              type: SchemaType.STRING,
              description: "New start time (ISO 8601)",
            },
            end_time: { type: SchemaType.STRING, description: "New end time (ISO 8601)" },
            description: { type: SchemaType.STRING, description: "New event description" },
          },
          required: ["event_id"],
        },
      },
      {
        name: "delete_calendar_event",
        description: "Delete a Google Calendar event by ID.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            event_id: {
              type: SchemaType.STRING,
              description: "Google Calendar event ID to delete",
            },
          },
          required: ["event_id"],
        },
      },
      // --- Twitter tools ---
      {
        name: "draft_tweet",
        description:
          "Draft a new tweet. Optionally start a thread or schedule it for later.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            content: {
              type: SchemaType.STRING,
              description: "Tweet text (max 280 characters)",
            },
            thread: {
              type: SchemaType.BOOLEAN,
              description: "If true, creates the first tweet of a new thread",
            },
            schedule_at: {
              type: SchemaType.STRING,
              description: "Optional ISO 8601 datetime to schedule the tweet",
            },
          },
          required: ["content"],
        },
      },
      {
        name: "add_thread_tweet",
        description: "Add a new tweet to an existing thread.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            thread_id: {
              type: SchemaType.STRING,
              description: "UUID of the thread to append to",
            },
            content: {
              type: SchemaType.STRING,
              description: "Tweet text (max 280 characters)",
            },
          },
          required: ["thread_id", "content"],
        },
      },
      {
        name: "schedule_tweet",
        description: "Schedule an existing draft tweet for a specific time.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            tweet_id: {
              type: SchemaType.STRING,
              description: "UUID of the draft tweet to schedule",
            },
            scheduled_at: {
              type: SchemaType.STRING,
              description: "ISO 8601 datetime to schedule the tweet",
            },
          },
          required: ["tweet_id", "scheduled_at"],
        },
      },
      {
        name: "post_tweet_now",
        description:
          "Post a draft or scheduled tweet to Twitter immediately. For threads, posts all tweets in the thread.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            tweet_id: {
              type: SchemaType.STRING,
              description: "UUID of the tweet to post",
            },
          },
          required: ["tweet_id"],
        },
      },
      {
        name: "get_tweet_queue",
        description:
          "Get the current tweet queue. Optionally filter by status (draft, scheduled, posted).",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            status: {
              type: SchemaType.STRING,
              description: "Filter by status: draft, scheduled, posted, or failed",
            },
          },
        },
      },
      {
        name: "delete_tweet",
        description:
          "Delete a tweet from the queue. If already posted to Twitter, also deletes it from Twitter.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            tweet_id: {
              type: SchemaType.STRING,
              description: "UUID of the tweet to delete",
            },
          },
          required: ["tweet_id"],
        },
      },
      {
        name: "suggest_tweet_ideas",
        description:
          "Suggest tweet ideas based on a topic. The AI will generate creative tweet suggestions.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            topic: {
              type: SchemaType.STRING,
              description: "Topic to generate tweet ideas about",
            },
            count: {
              type: SchemaType.NUMBER,
              description: "Number of suggestions to generate (default 3)",
            },
          },
        },
      },
    ],
  },
];

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "unknown time";
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function buildSystemPrompt(
  todos: { id: string; title: string; priority: string; tags: string[]; due_date?: string; completed: boolean }[],
  todayEvents: CalendarEvent[],
  tweets?: Tweet[]
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

  const tweetSection =
    tweets && tweets.length > 0
      ? tweets
          .map((t) => {
            const sched = t.scheduled_at
              ? ` (scheduled: ${new Date(t.scheduled_at).toLocaleString()})`
              : "";
            const thread = t.thread_id ? ` [thread: ${t.thread_id}, #${t.thread_order}]` : "";
            return `- [${t.status.toUpperCase()}] "${t.content}"${thread}${sched} (id: ${t.id})`;
          })
          .join("\n")
      : "No tweets in queue.";

  return `You are SignalOS, Steven's personal AI command center. You manage his calendar, todo list, and Twitter/X presence.

## User Context
Steven is a CS student with lectures Tues/Thurs at 10am and 5pm. He works on a startup, takes Upwork gigs, and does DoorDash evenings. He wakes at 9am, sleeps at 1am.

## Current Date & Time
${dateStr} at ${timeStr}

## Today's Agenda
${agendaSection}

## Current Todo List
${todoSection}

## Tweet Queue
${tweetSection}

## Instructions
- Auto-tag todos based on context (e.g. "meal prep" -> "personal", "leetcode" -> "school", "client project" -> "upwork").
- Be concise. Prioritize actionable responses.
- When adding todos, always infer appropriate tags and priority if the user doesn't specify.
- When referring to existing todos, use their IDs from the list above.
- For calendar operations, use ISO 8601 datetime format.
- Keep tweets under 280 characters. Auto-suggest relevant hashtags. Match Steven's voice: casual, technical, builder mindset.
- When referring to existing tweets, use their IDs from the queue above.`;
}

export interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export function getModel(systemPrompt: string) {
  return genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: systemPrompt,
    tools: geminiTools,
  });
}
