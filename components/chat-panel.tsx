"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/components/chat-message";
import { Send } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "Good morning, Steven. You've got a solid day ahead. Your CS 301 lecture starts in 20 minutes \u2014 I've pulled last week's notes if you need a quick refresher.",
  },
  {
    id: "2",
    role: "user",
    content: "What should I prioritize after class?",
  },
  {
    id: "3",
    role: "assistant",
    content:
      "I'd suggest tackling the pitch deck before your 2 pm standup \u2014 your co-founders will want to review it. The CS problem set is due Thursday, so that can wait until tonight.",
  },
  {
    id: "4",
    role: "user",
    content: "Can you reschedule the Upwork call if it conflicts with DoorDash?",
  },
  {
    id: "5",
    role: "assistant",
    content:
      "They don't overlap \u2014 your client call ends at 5:15 and DoorDash starts at 6. You'll have 45 minutes to grab dinner and drive to the zone. I'll set a reminder at 5:30.",
  },
];

const AI_RESPONSES = [
  "I've pulled up your CS 301 notes from last Thursday. The key topics were graph traversal and Dijkstra's algorithm. Want me to create flashcards?",
  "Your pitch deck is at 8 slides right now. I'd cut the market size slide and expand the traction section \u2014 investors care more about momentum.",
  "The Upwork client left feedback on the navbar \u2014 they want the mobile breakpoint at 768px instead of 640px. Quick fix.",
  "DoorDash peak pay is +$2.50 tonight in the downtown zone. I'd start at 6 sharp to catch the dinner rush.",
  "Your focus time this week is up 18% \u2014 the morning blocks before class are working well. Keep that pattern.",
  "I've scheduled 'meal prep' for Sunday at 11am and added a grocery list to your todos based on last week's meals.",
  "The problem set is 4 questions on dynamic programming. Based on your past submissions, budget 2 hours minimum.",
];

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const responseIndexRef = useRef(0);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  function sendMessage() {
    const text = input.trim();
    if (!text) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    const delay = 1200 + Math.random() * 1200;
    setTimeout(() => {
      setIsTyping(false);
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: AI_RESPONSES[responseIndexRef.current % AI_RESPONSES.length],
      };
      responseIndexRef.current++;
      setMessages((prev) => [...prev, aiMsg]);
    }, delay);
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
      style={{
        overflow: "hidden",
        minHeight: 420,
        opacity: 0,
        transform: "translateY(20px)",
        animation: "fadeUp 0.7s var(--ease-out) 0.55s forwards",
      }}
    >
      <div className="panel-header">
        <span className="panel-title">Claude</span>
        <span className="panel-badge">AI assistant</span>
      </div>
      <div className="panel-body">
        <div className="chat-messages">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
          ))}
          {isTyping && (
            <div className="typing-indicator visible">
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
            placeholder="Ask Claude anything..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="chat-send" onClick={sendMessage}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
