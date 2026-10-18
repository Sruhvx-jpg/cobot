import React, { useEffect, useRef } from "react";
import type { ChatMessage } from "../../types/chat.js";
import { MessageItem } from "./MessageItem.js";

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isStreaming,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return <div className="flex-1" />;
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-2">
      {messages.map((msg, index) => (
        <MessageItem
          key={msg.id}
          message={msg}
          isStreaming={
            isStreaming &&
            index === messages.length - 1 &&
            msg.role === "assistant"
          }
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
