import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  getAuthenticatedTwitterClient,
  postTweet,
  postThread,
} from "@/lib/twitter";
import type { Tweet } from "@/lib/types";

// --- Recurring rule helpers ---

function parseRecurringRule(
  rule: string,
  baseDate: Date
): Date | null {
  // Formats: 'daily:HH:MM' or 'weekly:DAY:HH:MM'
  const parts = rule.split(":");
  if (parts[0] === "daily" && parts.length === 3) {
    const hour = parseInt(parts[1], 10);
    const minute = parseInt(parts[2], 10);
    const next = new Date(baseDate);
    next.setDate(next.getDate() + 1);
    next.setHours(hour, minute, 0, 0);
    return next;
  }
  if (parts[0] === "weekly" && parts.length === 4) {
    const dayMap: Record<string, number> = {
      sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
    };
    const targetDay = dayMap[parts[1].toLowerCase()];
    if (targetDay === undefined) return null;
    const hour = parseInt(parts[2], 10);
    const minute = parseInt(parts[3], 10);
    const next = new Date(baseDate);
    // Advance to next occurrence of target day
    const currentDay = next.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    next.setDate(next.getDate() + daysUntil);
    next.setHours(hour, minute, 0, 0);
    return next;
  }
  return null;
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7); // '2026-02'
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = { processed: 0, posted: 0, failed: 0 };

  try {
    // 0. Reset tweets stuck in "posting" status for more than 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase
      .from("tweets")
      .update({ status: "failed", error: "Posting timed out", updated_at: new Date().toISOString() })
      .eq("status", "posting")
      .lt("updated_at", fiveMinAgo);

    // 1. Check rate limits for current month
    const currentMonth = getCurrentMonth();
    const { data: rateRow } = await supabase
      .from("twitter_rate_limits")
      .select("tweets_posted")
      .eq("month", currentMonth)
      .single();

    const tweetsPostedThisMonth = rateRow?.tweets_posted ?? 0;
    if (tweetsPostedThisMonth >= 1500) {
      return NextResponse.json({
        ...summary,
        skipped: true,
        reason: "Monthly rate limit reached (1,500 tweets)",
      });
    }

    // 2. Query due tweets
    const now = new Date().toISOString();
    const { data: dueTweets, error: queryError } = await supabase
      .from("tweets")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true });

    if (queryError) throw queryError;
    if (!dueTweets || dueTweets.length === 0) {
      return NextResponse.json({ ...summary, message: "No tweets due" });
    }

    // 3. Group by thread_id
    const singleTweets: Tweet[] = [];
    const threadGroups = new Map<string, Tweet[]>();

    for (const tweet of dueTweets as Tweet[]) {
      if (!tweet.thread_id) {
        singleTweets.push(tweet);
      } else {
        const group = threadGroups.get(tweet.thread_id) || [];
        group.push(tweet);
        threadGroups.set(tweet.thread_id, group);
      }
    }

    // 4. Get authenticated client
    const client = await getAuthenticatedTwitterClient();
    if (!client) {
      // Mark all due tweets as failed
      const ids = dueTweets.map((t: Tweet) => t.id);
      await supabase
        .from("tweets")
        .update({ status: "failed", error: "Twitter client not authenticated", updated_at: new Date().toISOString() })
        .in("id", ids);
      return NextResponse.json({
        ...summary,
        processed: ids.length,
        failed: ids.length,
        error: "Twitter client not authenticated",
      });
    }

    let remainingQuota = 1500 - tweetsPostedThisMonth;

    // 5. Post single tweets
    for (const tweet of singleTweets) {
      summary.processed++;
      if (remainingQuota <= 0) {
        await supabase
          .from("tweets")
          .update({ status: "failed", error: "Monthly rate limit reached", updated_at: new Date().toISOString() })
          .eq("id", tweet.id);
        summary.failed++;
        continue;
      }

      try {
        const result = await postTweet(client, tweet.content, tweet.media_urls?.length ? tweet.media_urls : undefined);
        const twitterId = result.data?.id;
        await supabase
          .from("tweets")
          .update({
            status: "posted",
            twitter_id: twitterId,
            posted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", tweet.id);
        remainingQuota--;
        summary.posted++;

        // Handle recurring
        if (tweet.recurring_rule) {
          const nextDate = parseRecurringRule(tweet.recurring_rule, new Date());
          if (nextDate) {
            await supabase.from("tweets").insert({
              content: tweet.content,
              media_urls: tweet.media_urls,
              status: "scheduled",
              scheduled_at: nextDate.toISOString(),
              recurring_rule: tweet.recurring_rule,
            });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await supabase
          .from("tweets")
          .update({ status: "failed", error: errorMsg, updated_at: new Date().toISOString() })
          .eq("id", tweet.id);
        summary.failed++;
      }
    }

    // 6. Post threads
    for (const [, tweets] of threadGroups) {
      const sorted = tweets.sort((a, b) => a.thread_order - b.thread_order);
      const tweetCount = sorted.length;
      summary.processed += tweetCount;

      if (remainingQuota < tweetCount) {
        for (const t of sorted) {
          await supabase
            .from("tweets")
            .update({ status: "failed", error: "Monthly rate limit reached", updated_at: new Date().toISOString() })
            .eq("id", t.id);
        }
        summary.failed += tweetCount;
        continue;
      }

      try {
        const threadContent = sorted.map((t) => t.content);
        const results = await postThread(client, threadContent);
        remainingQuota -= tweetCount;

        for (let i = 0; i < sorted.length; i++) {
          const twitterId = results[i]?.data?.id;
          await supabase
            .from("tweets")
            .update({
              status: "posted",
              twitter_id: twitterId,
              posted_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", sorted[i].id);
        }
        summary.posted += tweetCount;

        // Handle recurring for the first tweet in thread
        const firstTweet = sorted[0];
        if (firstTweet.recurring_rule) {
          const nextDate = parseRecurringRule(firstTweet.recurring_rule, new Date());
          if (nextDate) {
            const newThreadId = crypto.randomUUID();
            for (const t of sorted) {
              await supabase.from("tweets").insert({
                content: t.content,
                thread_id: newThreadId,
                thread_order: t.thread_order,
                media_urls: t.media_urls,
                status: "scheduled",
                scheduled_at: nextDate.toISOString(),
                recurring_rule: t === firstTweet ? t.recurring_rule : null,
              });
            }
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        for (const t of sorted) {
          await supabase
            .from("tweets")
            .update({ status: "failed", error: errorMsg, updated_at: new Date().toISOString() })
            .eq("id", t.id);
        }
        summary.failed += tweetCount;
      }
    }

    // 7. Update rate limit counter
    const totalPosted = summary.posted;
    if (totalPosted > 0) {
      await supabase
        .from("twitter_rate_limits")
        .upsert(
          {
            month: currentMonth,
            tweets_posted: tweetsPostedThisMonth + totalPosted,
            last_posted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "month" }
        );
    }

    return NextResponse.json(summary);
  } catch (err) {
    console.error("Cron tweet-scheduler error:", err);
    return NextResponse.json(
      {
        ...summary,
        error: `Tweet scheduler failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
