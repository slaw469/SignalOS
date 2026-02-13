import { supabase } from "@/lib/supabase";
import {
  getCalendarEvents,
  createCalendarEvent as gcalCreate,
  updateCalendarEvent as gcalUpdate,
  deleteCalendarEvent as gcalDelete,
} from "@/lib/google-calendar";
import {
  getAuthenticatedTwitterClient,
  postTweet as twitterPostTweet,
  postThread as twitterPostThread,
  deleteTweet as twitterDeleteTweet,
} from "@/lib/twitter";
import {
  createPost as postizCreatePost,
  getIntegrations as postizGetIntegrations,
} from "@/lib/postiz";

const POSTING_BACKEND = process.env.POSTING_BACKEND || "direct"; // "postiz" | "direct"

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// --- Token Helper ---

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "google_access_token")
    .single();
  if (error && error.code !== "PGRST116") {
    throw new Error("Database error retrieving access token");
  }
  return data?.value ?? null;
}

// --- Todo Handlers ---

async function addTodo(input: {
  title: string;
  description?: string;
  priority: string;
  tags?: string[];
  due_date?: string;
}): Promise<ToolResult> {
  const { data, error } = await supabase
    .from("todos")
    .insert({
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      tags: input.tags ?? [],
      due_date: input.due_date ?? null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

async function updateTodo(input: {
  todo_id: string;
  title?: string;
  priority?: string;
  tags?: string[];
  due_date?: string;
  completed?: boolean;
}): Promise<ToolResult> {
  const { todo_id, ...fields } = input;
  const updates: Record<string, unknown> = {};

  if (fields.title !== undefined) updates.title = fields.title;
  if (fields.priority !== undefined) updates.priority = fields.priority;
  if (fields.tags !== undefined) updates.tags = fields.tags;
  if (fields.due_date !== undefined) updates.due_date = fields.due_date;
  if (fields.completed !== undefined) updates.completed = fields.completed;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("todos")
    .update(updates)
    .eq("id", todo_id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Todo not found" };
  return { success: true, data };
}

async function deleteTodo(input: { todo_id: string }): Promise<ToolResult> {
  const { error, count } = await supabase
    .from("todos")
    .delete({ count: "exact" })
    .eq("id", input.todo_id);

  if (error) return { success: false, error: error.message };
  if (count === 0) return { success: false, error: "Todo not found" };
  return { success: true, data: { deleted: input.todo_id } };
}

async function getTodos(input: {
  filter_tag?: string;
  filter_priority?: string;
  include_completed?: boolean;
}): Promise<ToolResult> {
  let query = supabase.from("todos").select("*");

  if (!input.include_completed) {
    query = query.eq("completed", false);
  }

  if (input.filter_priority) {
    query = query.eq("priority", input.filter_priority);
  }

  if (input.filter_tag) {
    query = query.contains("tags", [input.filter_tag]);
  }

  const { data, error } = await query.order("created_at", {
    ascending: false,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// --- Calendar Handlers ---

const CALENDAR_NOT_CONNECTED =
  "Google Calendar is not connected. Please connect Google Calendar in settings first.";

async function getTodaysAgenda(): Promise<ToolResult> {
  const token = await getAccessToken();
  if (!token) return { success: false, error: CALENDAR_NOT_CONNECTED };

  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const events = await getCalendarEvents(token, startOfDay, endOfDay);
    return { success: true, data: events };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch today's events: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function getWeekAgenda(): Promise<ToolResult> {
  const token = await getAccessToken();
  if (!token) return { success: false, error: CALENDAR_NOT_CONNECTED };

  try {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - dayOfWeek));
    const events = await getCalendarEvents(token, startOfWeek.toISOString(), endOfWeek.toISOString());
    return { success: true, data: events };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch week events: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function createCalendarEvent(input: {
  title: string;
  start_time: string;
  end_time: string;
  description?: string;
  location?: string;
}): Promise<ToolResult> {
  const token = await getAccessToken();
  if (!token) return { success: false, error: CALENDAR_NOT_CONNECTED };

  try {
    const event = await gcalCreate(token, {
      title: input.title,
      start_time: input.start_time,
      end_time: input.end_time,
      description: input.description,
      location: input.location,
    });
    return { success: true, data: event };
  } catch (err) {
    return {
      success: false,
      error: `Failed to create event: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function updateCalendarEvent(input: {
  event_id: string;
  title?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
}): Promise<ToolResult> {
  const token = await getAccessToken();
  if (!token) return { success: false, error: CALENDAR_NOT_CONNECTED };

  try {
    const updates: { title?: string; start_time?: string; end_time?: string; description?: string } = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.start_time !== undefined) updates.start_time = input.start_time;
    if (input.end_time !== undefined) updates.end_time = input.end_time;
    if (input.description !== undefined) updates.description = input.description;

    const event = await gcalUpdate(token, input.event_id, updates);
    return { success: true, data: event };
  } catch (err) {
    return {
      success: false,
      error: `Failed to update event: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function deleteCalendarEvent(input: {
  event_id: string;
}): Promise<ToolResult> {
  const token = await getAccessToken();
  if (!token) return { success: false, error: CALENDAR_NOT_CONNECTED };

  try {
    await gcalDelete(token, input.event_id);
    return { success: true, data: { deleted: input.event_id } };
  } catch (err) {
    return {
      success: false,
      error: `Failed to delete event: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// --- Twitter Handlers ---

const TWITTER_NOT_CONNECTED =
  "Twitter is not connected. Please connect your Twitter account first.";

async function draftTweet(input: {
  content: string;
  thread?: boolean;
  schedule_at?: string;
}): Promise<ToolResult> {
  if (!input.content || input.content.trim().length === 0) {
    return { success: false, error: "Tweet content cannot be empty" };
  }
  if (input.content.length > 280) {
    return { success: false, error: `Tweet content is ${input.content.length} characters. Max is 280.` };
  }

  const status = input.schedule_at ? "scheduled" : "draft";
  const thread_id = input.thread ? crypto.randomUUID() : null;

  const { data, error } = await supabase
    .from("tweets")
    .insert({
      content: input.content,
      status,
      scheduled_at: input.schedule_at ?? null,
      thread_id,
      thread_order: thread_id ? 0 : 0,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

async function addThreadTweet(input: {
  thread_id: string;
  content: string;
}): Promise<ToolResult> {
  if (!input.content || input.content.trim().length === 0) {
    return { success: false, error: "Tweet content cannot be empty" };
  }
  if (input.content.length > 280) {
    return { success: false, error: `Tweet content is ${input.content.length} characters. Max is 280.` };
  }

  // Find the current max thread_order for this thread
  const { data: existing, error: fetchError } = await supabase
    .from("tweets")
    .select("thread_order")
    .eq("thread_id", input.thread_id)
    .order("thread_order", { ascending: false })
    .limit(1);

  if (fetchError) return { success: false, error: fetchError.message };

  const nextOrder = existing && existing.length > 0 ? existing[0].thread_order + 1 : 1;

  const { data, error } = await supabase
    .from("tweets")
    .insert({
      content: input.content,
      thread_id: input.thread_id,
      thread_order: nextOrder,
      status: "draft",
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

async function scheduleTweet(input: {
  tweet_id: string;
  scheduled_at: string;
}): Promise<ToolResult> {
  const { data, error } = await supabase
    .from("tweets")
    .update({
      scheduled_at: input.scheduled_at,
      status: "scheduled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.tweet_id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Tweet not found" };
  return { success: true, data };
}

async function postTweetNow(input: { tweet_id: string }): Promise<ToolResult> {
  // Get the tweet from DB
  const { data: tweet, error: fetchError } = await supabase
    .from("tweets")
    .select("*")
    .eq("id", input.tweet_id)
    .single();

  if (fetchError) return { success: false, error: fetchError.message };
  if (!tweet) return { success: false, error: "Tweet not found" };
  if (tweet.status === "posted" || tweet.status === "posting") {
    return { success: false, error: `Tweet is already ${tweet.status}` };
  }

  // Route to Postiz or direct Twitter based on POSTING_BACKEND env var
  if (POSTING_BACKEND === "postiz") {
    return postTweetViaPostiz(tweet, input.tweet_id);
  }
  return postTweetDirect(tweet, input.tweet_id);
}

// --- Postiz posting path ---

async function postTweetViaPostiz(
  tweet: Record<string, unknown>,
  tweetId: string
): Promise<ToolResult> {
  // Mark as "posting" to prevent concurrent re-posts (see Bug Log #4, #5)
  await supabase
    .from("tweets")
    .update({ status: "posting", updated_at: new Date().toISOString() })
    .eq("id", tweetId);

  try {
    // Find the X/Twitter integration in Postiz
    const integrations = await postizGetIntegrations();
    const xIntegration = integrations.find(
      (i) => i.platform === "x" || i.platform === "twitter"
    );
    if (!xIntegration) {
      return { success: false, error: "No X/Twitter integration found in Postiz. Add one first." };
    }

    const postizResult = await postizCreatePost({
      type: "now",
      posts: [
        {
          integration: { id: xIntegration.id },
          value: [{ content: tweet.content as string }],
          settings: { __type: xIntegration.platform },
        },
      ],
    });

    const now = new Date().toISOString();
    await supabase
      .from("tweets")
      .update({
        status: "posted",
        postiz_post_id: postizResult.id,
        postiz_state: postizResult.state,
        postiz_synced_at: now,
        posted_at: now,
        updated_at: now,
      })
      .eq("id", tweetId);

    return { success: true, data: { posted: 1, postiz_post_id: postizResult.id } };
  } catch (err) {
    await supabase
      .from("tweets")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tweetId);

    return {
      success: false,
      error: `Failed to post via Postiz: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// --- Direct Twitter posting path (fallback) ---

async function postTweetDirect(
  tweet: Record<string, unknown>,
  tweetId: string
): Promise<ToolResult> {
  // Mark as "posting" to prevent concurrent re-posts (see Bug Log #4, #5)
  await supabase
    .from("tweets")
    .update({ status: "posting", updated_at: new Date().toISOString() })
    .eq("id", tweetId);

  const client = await getAuthenticatedTwitterClient();
  if (!client) return { success: false, error: TWITTER_NOT_CONNECTED };

  try {
    // Check if this is part of a thread
    if (tweet.thread_id) {
      // Fetch all tweets in this thread, ordered
      const { data: threadTweets, error: threadError } = await supabase
        .from("tweets")
        .select("*")
        .eq("thread_id", tweet.thread_id as string)
        .order("thread_order", { ascending: true });

      if (threadError) return { success: false, error: threadError.message };
      if (!threadTweets || threadTweets.length === 0) {
        return { success: false, error: "No tweets found in thread" };
      }

      const tweetContents = threadTweets.map((t: { content: string }) => t.content);
      const results = await twitterPostThread(client, tweetContents);

      // Update all thread tweets with posted status
      for (let i = 0; i < threadTweets.length; i++) {
        const twitterId = results[i]?.data?.id ?? null;
        await supabase
          .from("tweets")
          .update({
            status: "posted",
            twitter_id: twitterId,
            posted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", threadTweets[i].id);
      }

      return { success: true, data: { posted: threadTweets.length, thread_id: tweet.thread_id } };
    } else {
      // Single tweet
      const result = await twitterPostTweet(client, tweet.content as string);
      const twitterId = result?.data?.id ?? null;

      await supabase
        .from("tweets")
        .update({
          status: "posted",
          twitter_id: twitterId,
          posted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", tweetId);

      return { success: true, data: { posted: 1, twitter_id: twitterId } };
    }
  } catch (err) {
    // Mark as failed with error
    await supabase
      .from("tweets")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tweetId);

    return {
      success: false,
      error: `Failed to post tweet: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function getTweetQueue(input: {
  status?: string;
}): Promise<ToolResult> {
  let query = supabase.from("tweets").select("*");

  if (input.status) {
    query = query.eq("status", input.status);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

async function handleDeleteTweet(input: { tweet_id: string }): Promise<ToolResult> {
  // Fetch the tweet first to check if it's posted
  const { data: tweet, error: fetchError } = await supabase
    .from("tweets")
    .select("*")
    .eq("id", input.tweet_id)
    .single();

  if (fetchError) return { success: false, error: fetchError.message };
  if (!tweet) return { success: false, error: "Tweet not found" };

  // If posted with a twitter_id, also delete from Twitter
  if (tweet.status === "posted" && tweet.twitter_id) {
    const client = await getAuthenticatedTwitterClient();
    if (client) {
      try {
        await twitterDeleteTweet(client, tweet.twitter_id);
      } catch (err) {
        // Log but don't fail the DB delete
        console.error("Failed to delete tweet from Twitter:", err);
      }
    }
  }

  const { error, count } = await supabase
    .from("tweets")
    .delete({ count: "exact" })
    .eq("id", input.tweet_id);

  if (error) return { success: false, error: error.message };
  if (count === 0) return { success: false, error: "Tweet not found" };
  return { success: true, data: { deleted: input.tweet_id } };
}

async function suggestTweetIdeas(input: {
  topic?: string;
  count?: number;
}): Promise<ToolResult> {
  const count = input.count ?? 3;
  const topicStr = input.topic ? ` about "${input.topic}"` : "";
  return {
    success: true,
    data: {
      message: `Please suggest ${count} tweet ideas${topicStr}. Keep them under 280 characters, casual and technical in Steven's builder voice. Include relevant hashtags.`,
    },
  };
}

// --- Cross-platform content formatting handler ---

type ContentType = "announcement" | "build_update" | "thought_leadership" | "link_share" | "question" | "thread" | "personal";

const PLATFORM_RULES: Record<string, string> = {
  x: "X/Twitter: Max 280 characters. Casual, punchy tone. 1-3 inline hashtags woven naturally into the text. Short sentences. Use line breaks for emphasis.",
  linkedin: "LinkedIn: Max 3,000 characters. Professional but personable. Open with a hook. 3 hashtags at the bottom separated from the body. If sharing a link, say 'link in comments' and don't put the URL in the post body.",
  bluesky: "Bluesky: Max 300 graphemes. Genuine, conversational tone — no corporate speak. 1-3 niche/community hashtags. Feels like talking to a friend who gets it.",
  mastodon: "Mastodon: Max 500 characters. Thoughtful, inclusive tone. 2-5 CamelCase hashtags (e.g. #WebDev, #OpenSource). Always include alt text descriptions for images. Content warnings where appropriate.",
  threads: "Threads: Max 500 characters. Casual, Instagram-adjacent vibe. 0-1 hashtags max. Conversational, like a quick thought drop. Emojis OK but not overdone.",
};

async function formatContentForPlatforms(input: {
  content: string;
  platforms?: string[];
  content_type?: ContentType;
  url?: string;
  include_hashtags?: boolean;
}): Promise<ToolResult> {
  const platforms = input.platforms ?? ["x", "linkedin", "bluesky", "mastodon", "threads"];
  const includeHashtags = input.include_hashtags ?? true;
  const contentType = input.content_type ?? "announcement";

  const rules = platforms
    .map((p) => PLATFORM_RULES[p])
    .filter(Boolean)
    .join("\n\n");

  const instructions = [
    `Reformat the following content for each platform. Content type: ${contentType}.`,
    rules,
    includeHashtags ? "Include platform-appropriate hashtags." : "Do NOT include any hashtags.",
    input.url ? `Include this URL where appropriate: ${input.url}` : "",
    "Return each platform version clearly labeled.",
    `\nOriginal content:\n${input.content}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    success: true,
    data: {
      formatting_instructions: instructions,
      platforms,
      content_type: contentType,
    },
  };
}

// --- Main Router ---

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<ToolResult> {
  switch (toolName) {
    case "add_todo":
      return addTodo(toolInput as Parameters<typeof addTodo>[0]);
    case "update_todo":
      return updateTodo(toolInput as Parameters<typeof updateTodo>[0]);
    case "delete_todo":
      return deleteTodo(toolInput as Parameters<typeof deleteTodo>[0]);
    case "get_todos":
      return getTodos(toolInput as Parameters<typeof getTodos>[0]);
    case "get_todays_agenda":
      return getTodaysAgenda();
    case "get_week_agenda":
      return getWeekAgenda();
    case "create_calendar_event":
      return createCalendarEvent(
        toolInput as Parameters<typeof createCalendarEvent>[0]
      );
    case "update_calendar_event":
      return updateCalendarEvent(
        toolInput as Parameters<typeof updateCalendarEvent>[0]
      );
    case "delete_calendar_event":
      return deleteCalendarEvent(
        toolInput as Parameters<typeof deleteCalendarEvent>[0]
      );
    case "draft_tweet":
      return draftTweet(toolInput as Parameters<typeof draftTweet>[0]);
    case "add_thread_tweet":
      return addThreadTweet(toolInput as Parameters<typeof addThreadTweet>[0]);
    case "schedule_tweet":
      return scheduleTweet(toolInput as Parameters<typeof scheduleTweet>[0]);
    case "post_tweet_now":
      return postTweetNow(toolInput as Parameters<typeof postTweetNow>[0]);
    case "get_tweet_queue":
      return getTweetQueue(toolInput as Parameters<typeof getTweetQueue>[0]);
    case "delete_tweet":
      return handleDeleteTweet(toolInput as Parameters<typeof handleDeleteTweet>[0]);
    case "suggest_tweet_ideas":
      return suggestTweetIdeas(toolInput as Parameters<typeof suggestTweetIdeas>[0]);
    case "format_content_for_platforms":
      return formatContentForPlatforms(
        toolInput as Parameters<typeof formatContentForPlatforms>[0]
      );
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}
