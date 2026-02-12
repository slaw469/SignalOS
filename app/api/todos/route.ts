import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tag = searchParams.get("tag");
  const priority = searchParams.get("priority");
  const includeCompleted = searchParams.get("include_completed") === "true";

  let query = supabase.from("todos").select("*");

  if (!includeCompleted) {
    query = query.eq("completed", false);
  }

  if (priority) {
    query = query.eq("priority", priority);
  }

  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data, error } = await query.order("created_at", {
    ascending: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sorted = (data ?? []).sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return NextResponse.json(sorted);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, description, priority, tags, due_date } = body as {
    title?: string;
    description?: string;
    priority?: string;
    tags?: string[];
    due_date?: string;
  };

  if (!title || typeof title !== "string") {
    return NextResponse.json(
      { error: "title is required and must be a string" },
      { status: 400 }
    );
  }

  const validPriorities = ["high", "medium", "low"];
  const todoPriority =
    typeof priority === "string" && validPriorities.includes(priority)
      ? priority
      : "medium";

  const { data, error } = await supabase
    .from("todos")
    .insert({
      title,
      description: description ?? null,
      priority: todoPriority,
      tags: Array.isArray(tags) ? tags : [],
      due_date: due_date ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
