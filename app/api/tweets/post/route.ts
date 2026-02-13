import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  getAuthenticatedTwitterClient,
  postTweet,
  postThread,
} from "@/lib/twitter";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { tweet_id, thread_id } = body as {
    tweet_id?: string;
    thread_id?: string;
  };

  if (!tweet_id && !thread_id) {
    return NextResponse.json(
      { error: "tweet_id or thread_id is required" },
      { status: 400 }
    );
  }

  // Check rate limit
  const currentMonth = new Date().toISOString().slice(0, 7); // '2026-02'
  const { data: rateLimit } = await supabase
    .from("twitter_rate_limits")
    .select("*")
    .eq("month", currentMonth)
    .single();

  if (rateLimit && rateLimit.tweets_posted >= 1400) {
    return NextResponse.json(
      { error: "Monthly tweet limit reached (safety cap 1,400 of 1,500). Try again next month." },
      { status: 429 }
    );
  }

  // Get authenticated Twitter client
  const client = await getAuthenticatedTwitterClient();
  if (!client) {
    return NextResponse.json(
      { error: "Twitter not connected. Please authenticate first." },
      { status: 401 }
    );
  }

  if (tweet_id) {
    return await handleSingleTweet(tweet_id, client, currentMonth);
  }

  return await handleThread(thread_id!, client, currentMonth);
}

async function handleSingleTweet(
  tweetId: string,
  client: import("twitter-api-v2").TwitterApi,
  currentMonth: string
) {
  // Fetch the tweet
  const { data: tweet, error: fetchError } = await supabase
    .from("tweets")
    .select("*")
    .eq("id", tweetId)
    .single();

  if (fetchError || !tweet) {
    return NextResponse.json({ error: "Tweet not found" }, { status: 404 });
  }

  if (tweet.status === "posted" || tweet.status === "posting") {
    return NextResponse.json(
      { error: `Tweet is already ${tweet.status}` },
      { status: 409 }
    );
  }

  // Mark as posting
  await supabase
    .from("tweets")
    .update({ status: "posting", updated_at: new Date().toISOString() })
    .eq("id", tweetId);

  try {
    const result = await postTweet(
      client,
      tweet.content,
      tweet.media_urls?.length > 0 ? tweet.media_urls : undefined
    );

    const twitterId = result.data.id;
    const now = new Date().toISOString();

    // Update tweet as posted
    const { data: updated } = await supabase
      .from("tweets")
      .update({
        status: "posted",
        twitter_id: twitterId,
        posted_at: now,
        updated_at: now,
      })
      .eq("id", tweetId)
      .select()
      .single();

    // Increment rate limit counter
    await incrementRateLimit(currentMonth);

    return NextResponse.json(updated);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Failed to post tweet";

    await supabase
      .from("tweets")
      .update({
        status: "failed",
        error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tweetId);

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

async function handleThread(
  threadId: string,
  client: import("twitter-api-v2").TwitterApi,
  currentMonth: string
) {
  // Fetch all tweets in the thread, ordered
  const { data: tweets, error: fetchError } = await supabase
    .from("tweets")
    .select("*")
    .eq("thread_id", threadId)
    .order("thread_order", { ascending: true });

  if (fetchError || !tweets || tweets.length === 0) {
    return NextResponse.json(
      { error: "No tweets found for this thread" },
      { status: 404 }
    );
  }

  // Mark all as posting
  const tweetIds = tweets.map((t) => t.id);
  await supabase
    .from("tweets")
    .update({ status: "posting", updated_at: new Date().toISOString() })
    .in("id", tweetIds);

  try {
    const threadContent = tweets.map((t) => t.content);
    const results = await postThread(client, threadContent);

    const now = new Date().toISOString();

    // Update each tweet with its twitter_id
    for (let i = 0; i < tweets.length; i++) {
      const twitterId = results[i]?.data?.id;
      await supabase
        .from("tweets")
        .update({
          status: "posted",
          twitter_id: twitterId ?? null,
          posted_at: now,
          updated_at: now,
        })
        .eq("id", tweets[i].id);
    }

    // Increment rate limit by number of tweets in thread
    await incrementRateLimit(currentMonth, tweets.length);

    // Re-fetch updated tweets
    const { data: updated } = await supabase
      .from("tweets")
      .select("*")
      .eq("thread_id", threadId)
      .order("thread_order", { ascending: true });

    return NextResponse.json(updated);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Failed to post thread";

    await supabase
      .from("tweets")
      .update({
        status: "failed",
        error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .in("id", tweetIds);

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

async function incrementRateLimit(currentMonth: string, count: number = 1) {
  const { data: existing } = await supabase
    .from("twitter_rate_limits")
    .select("*")
    .eq("month", currentMonth)
    .single();

  const now = new Date().toISOString();

  if (existing) {
    await supabase
      .from("twitter_rate_limits")
      .update({
        tweets_posted: existing.tweets_posted + count,
        last_posted_at: now,
        updated_at: now,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("twitter_rate_limits").insert({
      month: currentMonth,
      tweets_posted: count,
      last_posted_at: now,
    });
  }
}
