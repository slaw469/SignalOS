export type Priority = "high" | "medium" | "low";

export interface Todo {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  tags: string[];
  due_date?: string;
  completed: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool_calls?: ToolCall[] | null;
  created_at?: string;
  isError?: boolean;
}

export interface CalendarEvent {
  id?: string | null;
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  location?: string | null;
}

export interface Briefing {
  id: string;
  date: string;
  content: string;
  created_at: string;
}

export interface Setting {
  key: string;
  value: string;
  updated_at: string;
}
