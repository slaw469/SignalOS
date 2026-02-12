import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendMessage, buildSystemPrompt } from "@/lib/claude";
import { executeTool } from "@/lib/tools";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { getCalendarEvents } from "@/lib/google-calendar";

export async function POST(request: NextRequest) {
  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userMessage = body.message;
  if (!userMessage || typeof userMessage !== "string") {
    return NextResponse.json(
      { error: "message is required and must be a string" },
      { status: 400 }
    );
  }

  try {
    // 1. Fetch current todos
    const { data: todos } = await supabase
      .from("todos")
      .select("id, title, priority, tags, due_date, completed")
      .eq("completed", false)
      .order("created_at", { ascending: false });

    // 2. Fetch today's calendar events (gracefully handle if unavailable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let todayEvents: any[] = [];
    try {
      const { data: tokenRow } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "google_access_token")
        .single();

      if (tokenRow?.value) {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
        todayEvents = await getCalendarEvents(tokenRow.value, startOfDay, endOfDay);
      }
    } catch {
      // Google Calendar not connected yet — that's fine
    }

    // 3. Build system prompt with current context
    const systemPrompt = buildSystemPrompt(todos ?? [], todayEvents);

    // 4. Load last 50 messages from supabase for conversation history
    const { data: messageHistory } = await supabase
      .from("messages")
      .select("role, content, tool_calls")
      .order("created_at", { ascending: true })
      .limit(50);

    const conversationMessages: MessageParam[] = (messageHistory ?? []).map(
      (m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })
    );

    // Add the new user message
    conversationMessages.push({ role: "user", content: userMessage });

    // 5. Send to Claude with tool definitions — tool use loop
    const allToolCalls: { name: string; input: Record<string, unknown>; result: unknown }[] = [];
    let finalTextResponse = "";
    let currentMessages = [...conversationMessages];
    const MAX_TOOL_ITERATIONS = 10;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await sendMessage(currentMessages, systemPrompt);

      // Collect any text from this response
      const textBlocks = response.content.filter(
        (block) => block.type === "text"
      );
      for (const block of textBlocks) {
        if (block.type === "text") {
          finalTextResponse += block.text;
        }
      }

      // Check if Claude wants to use tools
      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls — we're done
        break;
      }

      // Execute each tool call and build tool results
      const assistantContent = response.content;
      const toolResults: { type: "tool_result"; tool_use_id: string; content: string }[] = [];

      for (const block of toolUseBlocks) {
        if (block.type === "tool_use") {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>
          );
          allToolCalls.push({
            name: block.name,
            input: block.input as Record<string, unknown>,
            result,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }

      // Add assistant response and tool results to messages for the next iteration
      currentMessages = [
        ...currentMessages,
        { role: "assistant", content: assistantContent },
        { role: "user", content: toolResults },
      ];
    }

    // 6. Store user message in supabase
    await supabase.from("messages").insert({
      role: "user",
      content: userMessage,
    });

    // 7. Store assistant response in supabase
    await supabase.from("messages").insert({
      role: "assistant",
      content: finalTextResponse,
      tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
    });

    // 8. Return response
    return NextResponse.json({
      response: finalTextResponse,
      tool_calls: allToolCalls.length > 0 ? allToolCalls : undefined,
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      {
        error: `Failed to process message: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
