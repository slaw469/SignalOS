import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendMessage, buildSystemPrompt } from "@/lib/claude";
import { executeTool } from "@/lib/tools";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { getCalendarEvents } from "@/lib/google-calendar";
import type { ToolCall, CalendarEvent } from "@/lib/types";

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
    const { data: todos, error: todosError } = await supabase
      .from("todos")
      .select("id, title, priority, tags, due_date, completed")
      .eq("completed", false)
      .order("created_at", { ascending: false });

    if (todosError) {
      console.error("Failed to fetch todos for chat context:", todosError);
    }

    // 2. Fetch today's calendar events (gracefully handle if unavailable)
    let todayEvents: CalendarEvent[] = [];
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
    const { data: messageHistory, error: historyError } = await supabase
      .from("messages")
      .select("role, content, tool_calls")
      .order("created_at", { ascending: true })
      .limit(50);

    if (historyError) {
      console.error("Failed to fetch message history:", historyError);
    }

    const conversationMessages: MessageParam[] = (messageHistory ?? []).map(
      (m) => {
        const toolCalls = m.tool_calls as ToolCall[] | null;
        if (m.role === "assistant" && toolCalls && toolCalls.length > 0) {
          const toolSummary = toolCalls
            .map((tc) => `[Tool: ${tc.name}(${JSON.stringify(tc.input)}) => ${JSON.stringify(tc.result)}]`)
            .join("\n");
          return {
            role: "assistant" as const,
            content: `${m.content}\n\n${toolSummary}`,
          };
        }
        return {
          role: m.role as "user" | "assistant",
          content: m.content,
        };
      }
    );

    // Add the new user message
    conversationMessages.push({ role: "user", content: userMessage });

    // 5. Send to Claude with tool definitions — tool use loop
    const allToolCalls: ToolCall[] = [];
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

      // Tool loop exhaustion: if we've hit the limit with no text response
      if (i === MAX_TOOL_ITERATIONS - 1 && !finalTextResponse) {
        finalTextResponse = "I tried to help but hit my processing limit. Please try rephrasing your request.";
      }
    }

    // 6. Store user message in supabase
    const { error: userInsertError } = await supabase.from("messages").insert({
      role: "user",
      content: userMessage,
    });
    if (userInsertError) {
      console.error("Failed to store user message:", userInsertError);
    }

    // 7. Store assistant response in supabase
    const { error: assistantInsertError } = await supabase.from("messages").insert({
      role: "assistant",
      content: finalTextResponse,
      tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
    });
    if (assistantInsertError) {
      console.error("Failed to store assistant message:", assistantInsertError);
    }

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
