import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAuthenticatedTwitterClient, uploadMedia } from "@/lib/twitter";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_GIF_SIZE = 15 * 1024 * 1024; // 15MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const tweetId = formData.get("tweet_id") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Send a file in the 'file' field." },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Allowed: JPEG, PNG, GIF, WEBP.` },
        { status: 400 }
      );
    }

    // Validate file size
    const maxSize = file.type === "image/gif" ? MAX_GIF_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      const limitMB = maxSize / (1024 * 1024);
      return NextResponse.json(
        { error: `File too large. Max size: ${limitMB}MB for ${file.type === "image/gif" ? "GIFs" : "images"}.` },
        { status: 400 }
      );
    }

    // Get authenticated OAuth 2.0 client (media.write scope required)
    const client = await getAuthenticatedTwitterClient();
    if (!client) {
      return NextResponse.json(
        { error: "Twitter not connected. Please authenticate first." },
        { status: 401 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Twitter using v2 media upload (OAuth 2.0)
    const mediaId = await uploadMedia(client, buffer, file.type);

    // If a tweet_id was provided, attach the media_id to the tweet
    if (tweetId) {
      const { data: tweet } = await supabase
        .from("tweets")
        .select("media_urls")
        .eq("id", tweetId)
        .single();

      if (tweet) {
        const existingUrls = tweet.media_urls || [];
        if (existingUrls.length < 4) {
          await supabase
            .from("tweets")
            .update({
              media_urls: [...existingUrls, mediaId],
              updated_at: new Date().toISOString(),
            })
            .eq("id", tweetId);
        }
      }
    }

    return NextResponse.json({
      media_id: mediaId,
      type: file.type,
      size: file.size,
    });
  } catch (err) {
    console.error("Media upload error:", err);
    const message = err instanceof Error ? err.message : "Failed to upload media";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
