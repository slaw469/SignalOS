export type Priority = "high" | "medium" | "low";

export interface Todo {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  tags: string[];
  due_date?: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool_calls: unknown;
  created_at: string;
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
