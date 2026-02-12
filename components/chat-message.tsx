interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isAI = role === "assistant";

  return (
    <div className={`chat-msg ${isAI ? "ai" : "user"}`}>
      <div className={`chat-avatar ${isAI ? "ai-av" : "user-av"}`}>
        {isAI ? "AI" : "S"}
      </div>
      <div className="chat-bubble">{content}</div>
    </div>
  );
}
