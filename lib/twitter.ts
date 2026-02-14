import { TwitterApi, SendTweetV2Params, TweetV2PostTweetResult, EUploadMimeType } from "twitter-api-v2";
import { supabase } from "@/lib/supabase";

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID!;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET || "";
const TWITTER_REDIRECT_URI =
  process.env.TWITTER_REDIRECT_URI || "http://localhost:8008/auth/twitter/callback";

const SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];

// --- OAuth 2.0 with PKCE ---

export function getTwitterAuthUrl(): { url: string; codeVerifier: string; state: string } {
  const client = new TwitterApi({ clientId: TWITTER_CLIENT_ID });
  const authLink = client.generateOAuth2AuthLink(TWITTER_REDIRECT_URI, {
    scope: SCOPES,
  });
  return {
    url: authLink.url,
    codeVerifier: authLink.codeVerifier,
    state: authLink.state,
  };
}

export async function getTwitterTokens(code: string, codeVerifier: string) {
  const client = new TwitterApi({
    clientId: TWITTER_CLIENT_ID,
    clientSecret: TWITTER_CLIENT_SECRET || undefined,
  });
  const result = await client.loginWithOAuth2({
    code,
    redirectUri: TWITTER_REDIRECT_URI,
    codeVerifier,
  });
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
    client: result.client,
  };
}

export async function refreshTwitterToken(refreshToken: string) {
  const client = new TwitterApi({
    clientId: TWITTER_CLIENT_ID,
    clientSecret: TWITTER_CLIENT_SECRET || undefined,
  });
  const result = await client.refreshOAuth2Token(refreshToken);
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    client: result.client,
  };
}

// --- Client constructors ---

export function getTwitterClient(accessToken: string): TwitterApi {
  return new TwitterApi(accessToken);
}

export function getTwitterClientV1(): TwitterApi {
  return new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
  });
}

// --- Tweet operations ---

export async function postTweet(
  client: TwitterApi,
  content: string,
  mediaIds?: string[]
): Promise<TweetV2PostTweetResult> {
  const params: SendTweetV2Params = { text: content };
  if (mediaIds && mediaIds.length > 0) {
    params.media = {
      media_ids: mediaIds.slice(0, 4) as unknown as [string],
    };
  }
  return client.v2.tweet(params);
}

export async function postThread(
  client: TwitterApi,
  tweets: (string | SendTweetV2Params)[]
): Promise<TweetV2PostTweetResult[]> {
  return client.v2.tweetThread(tweets);
}

export async function deleteTweet(
  client: TwitterApi,
  tweetId: string
): Promise<void> {
  await client.v2.deleteTweet(tweetId);
}

export async function uploadMedia(
  client: TwitterApi,
  imageBuffer: Buffer,
  mimeType: string
): Promise<string> {
  // Use v2 media upload (OAuth 2.0 with media.write scope)
  const mediaId = await client.v2.uploadMedia(imageBuffer, { media_type: mimeType as EUploadMimeType });
  return mediaId;
}

// --- Token helpers ---

export async function getStoredTwitterTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["twitter_access_token", "twitter_refresh_token"]);

  const tokens: Record<string, string> = {};
  if (data) {
    for (const row of data) {
      tokens[row.key] = row.value;
    }
  }

  return {
    accessToken: tokens.twitter_access_token || null,
    refreshToken: tokens.twitter_refresh_token || null,
  };
}

export async function getAuthenticatedTwitterClient(): Promise<TwitterApi | null> {
  const { accessToken, refreshToken } = await getStoredTwitterTokens();
  if (!accessToken) return null;

  // Always try to refresh the token first — OAuth2 tokens expire in 2 hours
  if (refreshToken) {
    try {
      const refreshed = await refreshTwitterToken(refreshToken);
      await supabase.from("settings").upsert(
        { key: "twitter_access_token", value: refreshed.accessToken, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      if (refreshed.refreshToken) {
        await supabase.from("settings").upsert(
          { key: "twitter_refresh_token", value: refreshed.refreshToken, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      }
      return refreshed.client;
    } catch (err) {
      console.error("Twitter token refresh failed:", err instanceof Error ? err.message : err);
      // Refresh token is likely expired — clear stored tokens so the UI
      // shows "X not connected" and the user can re-authenticate
      await supabase.from("settings").delete().eq("key", "twitter_access_token");
      await supabase.from("settings").delete().eq("key", "twitter_refresh_token");
      return null;
    }
  }

  // No refresh token — the access token is probably expired (2hr lifetime)
  // Return the client but it will likely fail on the first API call
  return getTwitterClient(accessToken);
}

// --- Smart scheduling ---

export function getOptimalPostingTimes(date: Date): string[] {
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;
  const dateStr = date.toISOString().split("T")[0];

  if (isWeekend) {
    return [`${dateStr}T10:00:00`, `${dateStr}T14:00:00`];
  }
  return [`${dateStr}T09:00:00`, `${dateStr}T12:00:00`, `${dateStr}T17:00:00`];
}
