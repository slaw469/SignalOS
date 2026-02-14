import { NextResponse } from "next/server";
import { getAuthenticatedTwitterClient, postTweet } from "@/lib/twitter";

export async function POST() {
  const steps: Record<string, unknown> = {};

  try {
    // Step 1: Get client
    const client = await getAuthenticatedTwitterClient();
    if (!client) {
      return NextResponse.json({
        error: "No authenticated client — tokens missing or refresh failed",
        steps,
      }, { status: 401 });
    }
    steps.client = "authenticated";

    // Step 2: Post a test tweet
    const result = await postTweet(client, "test from SignalOS " + Date.now());
    steps.raw_response = JSON.parse(JSON.stringify(result));
    steps.tweet_id = result?.data?.id;
    steps.tweet_text = result?.data?.text;

    return NextResponse.json({ success: true, steps });
  } catch (err: unknown) {
    const error = err as Error & { data?: unknown; code?: number; rateLimit?: unknown };
    steps.error_message = error.message;
    steps.error_name = error.name;
    steps.error_code = error.code;
    steps.error_data = error.data;
    steps.error_rateLimit = error.rateLimit;

    return NextResponse.json({ success: false, steps }, { status: 500 });
  }
}
