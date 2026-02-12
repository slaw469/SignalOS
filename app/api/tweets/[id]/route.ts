import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAuthenticatedTwitterClient, deleteTweet } from "@/lib/twitter";

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

  const allowedFields = [
    "content",
    "scheduled_at",
    "status",
    "media_urls",
    "error",
    "recurring_rule",
  ];
  const updates: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  if (
    "content" in updates &&
    typeof updates.content === "string" &&
    updates.content.length > 280
  ) {
    return NextResponse.json(
      { error: "content must be 280 characters or less" },
      { status: 400 }
    );
  }

  if (
    "status" in updates &&
    !["draft", "scheduled", "posting", "posted", "failed"].includes(
      updates.status as string
    )
  ) {
    return NextResponse.json(
      { error: "status must be draft, scheduled, posting, posted, or failed" },
      { status: 400 }
    );
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("tweets")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Tweet not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Fetch the tweet first to check if we need to delete from Twitter
  const { data: tweet, error: fetchError } = await supabase
    .from("tweets")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !tweet) {
    return NextResponse.json({ error: "Tweet not found" }, { status: 404 });
  }

  // If tweet was posted and has a twitter_id, delete from Twitter too
  if (tweet.status === "posted" && tweet.twitter_id) {
    try {
      const client = await getAuthenticatedTwitterClient();
      if (client) {
        await deleteTweet(client, tweet.twitter_id);
      }
    } catch {
      // Log but don't block DB deletion if Twitter delete fails
    }
  }

  const { error } = await supabase.from("tweets").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
