import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Toggle completion for a specific date
  if ("completed" in body && "date" in body) {
    const completed = body.completed as boolean;
    const date = body.date as string;

    if (completed) {
      const { error } = await supabase
        .from("daily_task_completions")
        .upsert(
          { daily_task_id: id, completed_date: date },
          { onConflict: "daily_task_id,completed_date" }
        );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await supabase
        .from("daily_task_completions")
        .delete()
        .eq("daily_task_id", id)
        .eq("completed_date", date);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, completed });
  }

  // Update title or sort_order
  const updates: Record<string, unknown> = {};
  if ("title" in body && typeof body.title === "string") {
    updates.title = (body.title as string).trim();
  }
  if ("sort_order" in body && typeof body.sort_order === "number") {
    updates.sort_order = body.sort_order;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("daily_tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { error, count } = await supabase
    .from("daily_tasks")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json(
      { error: "Daily task not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
