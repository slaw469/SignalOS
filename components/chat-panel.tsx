"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/components/chat-message";
import { Send, RotateCcw } from "lucide-react";
import type { Message } from "@/lib/types";

interface ChatPanelProps {
  onToolAction?: () => void;
}

export function ChatPanel({ onToolAction }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }

  // Load message history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch("/api/messages");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const mapped: Message[] = data.map((m: { id?: string; role: string; content: string; created_at?: string }) => ({
              id: m.id ?? m.created_at ?? String(Math.random()),
              role: m.role as "user" | "assistant",
              content: m.content,
            }));
            setMessages(mapped);
          }
        }
      } catch {
        // keep initial messages
      } finally {
        setLoaded(true);
      }
    }
    loadHistory();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = await res.json();

      if (res.ok) {
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.response || "I couldn't process that right now.",
        };
        setMessages((prev) => [...prev, aiMsg]);

        // If the AI used tools (e.g. added a todo, created calendar event), trigger refresh
        if (data.tool_calls && data.tool_calls.length > 0 && onToolAction) {
          onToolAction();
        }
      } else {
        const errorText = res.status === 429
          ? `Rate limit reached: ${data.error || "Too many requests. Please wait before trying again."}`
          : data.error || "Something went wrong. Please try again.";
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: errorText,
          isError: true,
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I'm having trouble connecting right now. Please try again.",
        isError: true,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setIsTyping(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <section
      className="glass chat-panel flex flex-col"
      aria-label="Chat with Signal"
      style={{
        overflow: "hidden",
        minHeight: 420,
        opacity: 0,
        transform: "translateY(20px)",
        animation: "fadeUp 0.7s var(--ease-out) 0.55s forwards",
      }}
    >
      <div className="panel-header">
        <span className="panel-title">Signal</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="panel-badge">{loaded ? "AI assistant" : "loading..."}</span>
          {messages.length > 0 && (
            <button
              onClick={async () => {
                try {
                  await fetch("/api/messages", { method: "DELETE" });
                } catch { /* ignore */ }
                setMessages([]);
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--ink-muted)",
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                transition: "color 0.2s ease",
              }}
              aria-label="Clear chat"
              title="New conversation"
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="panel-body">
        <div className="chat-messages" role="log" aria-live="polite">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} role={msg.role} content={msg.content} isError={msg.isError} />
          ))}
          {isTyping && (
            <div className="typing-indicator visible" role="status" aria-label="Signal is typing">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="chat-input-area">
          <input
            type="text"
            className="chat-input"
            placeholder="Ask Signal anything..."
            aria-label="Type a message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isTyping}
          />
          <button className="chat-send" onClick={sendMessage} disabled={isTyping} aria-label="Send message">
            <Send size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
