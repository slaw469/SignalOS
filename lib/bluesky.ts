import { AtpAgent, RichText, AtpSessionData } from "@atproto/api";
import { XRPCError, ResponseType } from "@atproto/xrpc";
import { supabase } from "@/lib/supabase";

const BLUESKY_SERVICE = "https://bsky.social";
const MAX_GRAPHEMES = 300;
const MAX_IMAGES_PER_POST = 4;
const MAX_IMAGE_SIZE = 1_000_000; // 1MB

// --- Session management ---

async function saveBlueskySession(sessionData: AtpSessionData): Promise<void> {
  await supabase.from("settings").upsert(
    {
      key: "bluesky_session",
      value: JSON.stringify(sessionData),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
}

async function loadBlueskySession(): Promise<AtpSessionData | null> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "bluesky_session")
    .single();

  if (!data?.value) return null;

  try {
    return JSON.parse(data.value) as AtpSessionData;
  } catch {
    return null;
  }
}

export async function getAuthenticatedBlueskyAgent(): Promise<AtpAgent | null> {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;

  if (!identifier || !appPassword) {
    console.error("Missing BLUESKY_IDENTIFIER or BLUESKY_APP_PASSWORD env vars");
    return null;
  }

  const agent = new AtpAgent({
    service: BLUESKY_SERVICE,
    persistSession: (_evt, sessionData) => {
      if (sessionData) {
        // Fire-and-forget session save on token refresh
        saveBlueskySession(sessionData).catch((err) =>
          console.error("Failed to persist Bluesky session:", err)
        );
      }
    },
  });

  // Try to resume an existing session first (avoids createSession rate limits)
  const existingSession = await loadBlueskySession();
  if (existingSession) {
    try {
      await agent.resumeSession(existingSession);
      return agent;
    } catch {
      // Session expired or invalid, fall through to login
      console.warn("Bluesky session resume failed, attempting fresh login");
    }
  }

  // Fall back to fresh login
  try {
    await agent.login({ identifier, password: appPassword });
    if (agent.session) {
      await saveBlueskySession(agent.session);
    }
    return agent;
  } catch (err) {
    console.error("Bluesky login failed:", err);
    return null;
  }
}

// --- Retry wrapper ---

async function withBlueskyRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (err instanceof XRPCError) {
        // Don't retry client errors (except rate limits and auth)
        if (
          err.status === ResponseType.InvalidRequest ||
          err.status === ResponseType.Forbidden
        ) {
          throw err;
        }

        // Rate limited — respect ratelimit-reset header
        if (err.status === ResponseType.RateLimitExceeded) {
          const resetHeader = err.headers?.["ratelimit-reset"];
          const waitMs = resetHeader
            ? Math.max(0, Number(resetHeader) * 1000 - Date.now())
            : 60_000;
          console.warn(`Bluesky rate limited, waiting ${Math.round(waitMs / 1000)}s`);
          await sleep(Math.min(waitMs, 300_000)); // cap at 5 min
          continue;
        }

        // Auth expired — don't retry here, caller should re-authenticate
        if (err.status === ResponseType.AuthenticationRequired) {
          throw err;
        }

        // 502/503 — retry with exponential backoff
        if (
          err.status === ResponseType.UpstreamFailure ||
          err.status === ResponseType.NotEnoughResources
        ) {
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
            console.warn(`Bluesky ${err.status} error, retrying in ${Math.round(delay)}ms`);
            await sleep(delay);
            continue;
          }
        }
      }

      // Unknown errors: retry with backoff if attempts remain
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await sleep(delay);
        continue;
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Validation ---

export function countGraphemes(text: string): number {
  const rt = new RichText({ text });
  return rt.graphemeLength;
}

export function validateBlueskyPost(text: string): {
  valid: boolean;
  graphemeLength: number;
} {
  const graphemeLength = countGraphemes(text);
  return {
    valid: graphemeLength > 0 && graphemeLength <= MAX_GRAPHEMES,
    graphemeLength,
  };
}

// --- Media ---

export async function uploadBlueskyImage(
  agent: AtpAgent,
  imageBuffer: Buffer | Uint8Array,
  mimeType: string
): Promise<{ blob: any; size: number }> {
  if (imageBuffer.byteLength > MAX_IMAGE_SIZE) {
    throw new Error(
      `Image exceeds maximum size of ${MAX_IMAGE_SIZE} bytes (got ${imageBuffer.byteLength})`
    );
  }

  const uint8 =
    imageBuffer instanceof Uint8Array
      ? imageBuffer
      : new Uint8Array(imageBuffer);

  // Strip EXIF metadata for JPEG images
  const cleaned = mimeType === "image/jpeg" ? stripExifData(uint8) : uint8;

  const response = await withBlueskyRetry(() =>
    agent.uploadBlob(cleaned, { encoding: mimeType })
  );

  return {
    blob: response.data.blob,
    size: cleaned.byteLength,
  };
}

/**
 * Minimal EXIF stripping for JPEG images.
 * Removes APP1 (EXIF) segments while preserving image data.
 */
function stripExifData(data: Uint8Array): Uint8Array {
  // JPEG must start with FF D8
  if (data[0] !== 0xff || data[1] !== 0xd8) return data;

  const segments: Uint8Array[] = [];
  // Keep SOI marker
  segments.push(data.slice(0, 2));

  let offset = 2;
  while (offset < data.length - 1) {
    if (data[offset] !== 0xff) break;

    const marker = data[offset + 1];

    // SOS (Start of Scan) — rest is image data, keep everything from here
    if (marker === 0xda) {
      segments.push(data.slice(offset));
      break;
    }

    // Markers without length (standalone)
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      segments.push(data.slice(offset, offset + 2));
      offset += 2;
      continue;
    }

    // Read segment length
    if (offset + 3 >= data.length) break;
    const segmentLength = (data[offset + 2] << 8) | data[offset + 3];
    const segmentEnd = offset + 2 + segmentLength;

    // APP1 (0xE1) is the EXIF marker — skip it
    if (marker === 0xe1) {
      offset = segmentEnd;
      continue;
    }

    // Keep all other segments
    segments.push(data.slice(offset, segmentEnd));
    offset = segmentEnd;
  }

  // Concatenate segments
  const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const segment of segments) {
    result.set(segment, pos);
    pos += segment.length;
  }
  return result;
}

// --- Posting ---

export async function postToBluesky(
  agent: AtpAgent,
  text: string,
  opts?: {
    images?: {
      data: Uint8Array;
      mimeType: string;
      alt: string;
      width?: number;
      height?: number;
    }[];
    externalLink?: {
      uri: string;
      title: string;
      description: string;
      thumb?: Uint8Array;
      thumbMimeType?: string;
    };
    replyTo?: {
      uri: string;
      cid: string;
      rootUri: string;
      rootCid: string;
    };
  }
): Promise<{ uri: string; cid: string }> {
  const validation = validateBlueskyPost(text);
  if (!validation.valid) {
    throw new Error(
      `Invalid post: ${validation.graphemeLength} graphemes (max ${MAX_GRAPHEMES})`
    );
  }

  // Build RichText with auto-detected facets (links, mentions, hashtags)
  const rt = new RichText({ text });
  await rt.detectFacets(agent);

  // Build the post record
  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  };

  // Attach images embed
  if (opts?.images && opts.images.length > 0) {
    if (opts.images.length > MAX_IMAGES_PER_POST) {
      throw new Error(
        `Too many images: ${opts.images.length} (max ${MAX_IMAGES_PER_POST})`
      );
    }

    const imageEmbeds = [];
    for (const img of opts.images) {
      const { blob } = await uploadBlueskyImage(agent, img.data, img.mimeType);
      imageEmbeds.push({
        alt: img.alt || "",
        image: blob,
        aspectRatio:
          img.width && img.height
            ? { width: img.width, height: img.height }
            : undefined,
      });
    }

    record.embed = {
      $type: "app.bsky.embed.images",
      images: imageEmbeds,
    };
  }

  // Attach external link card embed (only if no images)
  if (opts?.externalLink && !opts?.images?.length) {
    let thumbBlob = undefined;
    if (opts.externalLink.thumb && opts.externalLink.thumbMimeType) {
      const uploaded = await uploadBlueskyImage(
        agent,
        opts.externalLink.thumb,
        opts.externalLink.thumbMimeType
      );
      thumbBlob = uploaded.blob;
    }

    record.embed = {
      $type: "app.bsky.embed.external",
      external: {
        uri: opts.externalLink.uri,
        title: opts.externalLink.title,
        description: opts.externalLink.description,
        thumb: thumbBlob,
      },
    };
  }

  // Attach reply reference
  if (opts?.replyTo) {
    record.reply = {
      root: {
        uri: opts.replyTo.rootUri,
        cid: opts.replyTo.rootCid,
      },
      parent: {
        uri: opts.replyTo.uri,
        cid: opts.replyTo.cid,
      },
    };
  }

  const response = await withBlueskyRetry(() =>
    agent.com.atproto.repo.createRecord({
      repo: agent.assertDid,
      collection: "app.bsky.feed.post",
      record,
    })
  );

  return {
    uri: response.data.uri,
    cid: response.data.cid,
  };
}

// --- Threads ---

export async function postBlueskyThread(
  agent: AtpAgent,
  posts: string[]
): Promise<{ uri: string; cid: string }[]> {
  if (posts.length === 0) {
    throw new Error("Thread must contain at least one post");
  }

  // Validate all posts before sending any
  for (let i = 0; i < posts.length; i++) {
    const validation = validateBlueskyPost(posts[i]);
    if (!validation.valid) {
      throw new Error(
        `Post ${i + 1} invalid: ${validation.graphemeLength} graphemes (max ${MAX_GRAPHEMES})`
      );
    }
  }

  const results: { uri: string; cid: string }[] = [];

  for (let i = 0; i < posts.length; i++) {
    const replyTo =
      i === 0
        ? undefined
        : {
            uri: results[i - 1].uri,
            cid: results[i - 1].cid,
            rootUri: results[0].uri,
            rootCid: results[0].cid,
          };

    const result = await postToBluesky(agent, posts[i], { replyTo });
    results.push(result);
  }

  return results;
}

// --- Delete ---

export async function deleteBlueskyPost(
  agent: AtpAgent,
  postUri: string
): Promise<void> {
  // Extract rkey from AT URI: at://did:plc:xxx/app.bsky.feed.post/rkey
  const parts = postUri.split("/");
  const rkey = parts[parts.length - 1];
  const collection = parts.slice(-2, -1)[0];

  if (!rkey || collection !== "app.bsky.feed.post") {
    throw new Error(`Invalid post URI: ${postUri}`);
  }

  await withBlueskyRetry(() =>
    agent.com.atproto.repo.deleteRecord({
      repo: agent.assertDid,
      collection: "app.bsky.feed.post",
      rkey,
    })
  );
}
