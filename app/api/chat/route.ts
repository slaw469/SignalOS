import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildSystemPrompt, getModel } from "@/lib/claude";
import type { GeminiMessage } from "@/lib/claude";
import { executeTool } from "@/lib/tools";
import { getCalendarEvents } from "@/lib/google-calendar";
import { checkRateLimit, recordRequest } from "@/lib/rate-limit";
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

  // Rate limit check
  const limit = checkRateLimit();
  if (!limit.allowed) {
    return NextResponse.json(
      { error: limit.reason, remaining: limit.remaining },
      { status: 429 }
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

    // Convert DB history to Gemini format
    const history: GeminiMessage[] = (messageHistory ?? []).map((m) => {
      const toolCalls = m.tool_calls as ToolCall[] | null;
      let content = m.content;
      if (m.role === "assistant" && toolCalls && toolCalls.length > 0) {
        const toolSummary = toolCalls
          .map((tc) => `[Tool: ${tc.name}(${JSON.stringify(tc.input)}) => ${JSON.stringify(tc.result)}]`)
          .join("\n");
        content = `${m.content}\n\n${toolSummary}`;
      }
      return {
        role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
        parts: [{ text: content }],
      };
    });

    // 5. Start Gemini chat with history and send message — tool use loop
    const model = getModel(systemPrompt);
    const chat = model.startChat({ history });

    const allToolCalls: ToolCall[] = [];
    let finalTextResponse = "";
    const MAX_TOOL_ITERATIONS = 5;

    // First message
    let result = await chat.sendMessage(userMessage);
    recordRequest();

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = result.response;
      const parts = response.candidates?.[0]?.content?.parts ?? [];

      // Collect text
      for (const part of parts) {
        if ("text" in part && part.text) {
          finalTextResponse += part.text;
        }
      }

      // Check for function calls
      const functionCalls = parts.filter(
        (part): part is { functionCall: { name: string; args: Record<string, unknown> } } =>
          "functionCall" in part
      );

      if (functionCalls.length === 0) {
        break;
      }

      // Execute each function call and build responses
      const functionResponses: { functionResponse: { name: string; response: Record<string, unknown> } }[] = [];

      for (const fc of functionCalls) {
        const toolResult = await executeTool(
          fc.functionCall.name,
          fc.functionCall.args
        );
        allToolCalls.push({
          name: fc.functionCall.name,
          input: fc.functionCall.args,
          result: toolResult,
        });
        functionResponses.push({
          functionResponse: {
            name: fc.functionCall.name,
            response: toolResult as unknown as Record<string, unknown>,
          },
        });
      }

      // Send function results back to Gemini
      result = await chat.sendMessage(functionResponses);
      recordRequest();

      // Tool loop exhaustion
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
