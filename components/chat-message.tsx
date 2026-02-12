interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

export function ChatMessage({ role, content, isError }: ChatMessageProps) {
  const isAI = role === "assistant";

  return (
    <div className={`chat-msg ${isAI ? "ai" : "user"}`}>
      <div className={`chat-avatar ${isAI ? "ai-av" : "user-av"}`}>
        {isAI ? "AI" : "S"}
      </div>
      <div className={`chat-bubble${isError ? " chat-error" : ""}`}>{content}</div>
    </div>
  );
}
