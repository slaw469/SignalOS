import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedBlueskyAgent,
  postToBluesky,
  validateBlueskyPost,
} from "@/lib/bluesky";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { content, images, replyTo } = body as {
    content?: string;
    images?: {
      data: string; // base64-encoded
      mimeType: string;
      alt: string;
      width?: number;
      height?: number;
    }[];
    replyTo?: {
      uri: string;
      cid: string;
      rootUri: string;
      rootCid: string;
    };
  };

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json(
      { error: "content is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  const validation = validateBlueskyPost(content);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: `Post exceeds 300 grapheme limit (${validation.graphemeLength} graphemes)`,
        graphemeLength: validation.graphemeLength,
      },
      { status: 400 }
    );
  }

  const agent = await getAuthenticatedBlueskyAgent();
  if (!agent) {
    return NextResponse.json(
      { error: "Bluesky not connected. Please authenticate first." },
      { status: 401 }
    );
  }

  try {
    // Convert base64 image data to Uint8Array
    const imageOpts = images?.map((img) => ({
      data: Uint8Array.from(Buffer.from(img.data, "base64")),
      mimeType: img.mimeType,
      alt: img.alt,
      width: img.width,
      height: img.height,
    }));

    const result = await postToBluesky(agent, content.trim(), {
      images: imageOpts,
      replyTo,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Failed to post to Bluesky";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
