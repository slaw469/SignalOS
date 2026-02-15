import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const today =
    searchParams.get("date") || new Date().toISOString().slice(0, 10);

  const { data: tasks, error } = await supabase
    .from("daily_tasks")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!tasks || tasks.length === 0) {
    return NextResponse.json([]);
  }

  const taskIds = tasks.map((t) => t.id);
  const { data: completions, error: compError } = await supabase
    .from("daily_task_completions")
    .select("daily_task_id")
    .eq("completed_date", today)
    .in("daily_task_id", taskIds);

  if (compError) {
    return NextResponse.json({ error: compError.message }, { status: 500 });
  }

  const completedSet = new Set(
    (completions ?? []).map((c) => c.daily_task_id)
  );

  const result = tasks.map((task) => ({
    ...task,
    completed_today: completedSet.has(task.id),
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title } = body as { title?: string };

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json(
      { error: "title is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  const { data: lastTask } = await supabase
    .from("daily_tasks")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (lastTask?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("daily_tasks")
    .insert({ title: title.trim(), sort_order: nextOrder })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ...data, completed_today: false },
    { status: 201 }
  );
}
