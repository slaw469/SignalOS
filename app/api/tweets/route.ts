import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const threadId = searchParams.get("thread_id");

  let query = supabase.from("tweets").select("*");

  if (status) {
    const statuses = status.split(",").map((s) => s.trim());
    query = query.in("status", statuses);
  }

  if (threadId) {
    query = query.eq("thread_id", threadId);
  }

  const { data, error } = await query.order("created_at", {
    ascending: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { content, scheduled_at, media_urls, thread_id, thread_order } =
    body as {
      content?: string;
      scheduled_at?: string;
      media_urls?: string[];
      thread_id?: string;
      thread_order?: number;
    };

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json(
      { error: "content is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  if (content.length > 280) {
    return NextResponse.json(
      { error: "content must be 280 characters or less" },
      { status: 400 }
    );
  }

  const tweetStatus = scheduled_at ? "scheduled" : "draft";

  const { data, error } = await supabase
    .from("tweets")
    .insert({
      content: content.trim(),
      scheduled_at: scheduled_at ?? null,
      media_urls: Array.isArray(media_urls) ? media_urls : [],
      thread_id: thread_id ?? null,
      thread_order: typeof thread_order === "number" ? thread_order : 0,
      status: tweetStatus,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
