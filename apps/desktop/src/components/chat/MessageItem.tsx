import React from "react";
import { AlertTriangle } from "lucide-react";
import type { ChatMessage } from "../../types/chat.js";
import { ReasoningBlock } from "./ReasoningBlock.js";
import { ToolCallItem } from "./ToolCallItem.js";
import { LoadingDots } from "../feedback/LoadingDots.js";

interface MessageItemProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isStreaming = false,
}) => {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="w-full flex justify-end my-2">
        <div className="max-w-xl flex flex-col items-end gap-1">
          <div className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider">
            YOU
          </div>
          <div className="bg-[var(--bubble-user)] border border-[var(--border)] px-4 py-2.5 smooth-corners text-sm text-[var(--text-main)] whitespace-pre-wrap break-words leading-relaxed text-left shadow-sm">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  // Agent Message on LEFT side
  return (
    <div className="w-full flex justify-start my-2">
      <div className="max-w-3xl flex flex-col items-start gap-1 w-full">
        <div className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider">
          AGENT
        </div>

        {message.reasoning && (
          <div className="w-full">
            <ReasoningBlock reasoning={message.reasoning} />
          </div>
        )}

        {message.tools && message.tools.length > 0 && (
          <div className="w-full flex flex-col gap-1 my-1">
            {message.tools.map((tool) => (
              <ToolCallItem key={tool.id} tool={tool} />
            ))}
          </div>
        )}

        {message.error && (
          <div className="w-full max-w-2xl my-1.5 p-3 rounded-lg bg-red-950/40 border border-red-500/50 text-red-300 text-xs flex items-start gap-2.5 shadow-sm">
            <AlertTriangle
              size={15}
              className="text-red-400 flex-shrink-0 mt-0.5"
            />
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-red-200">
                AI Provider Error
              </span>
              <span className="leading-relaxed whitespace-pre-wrap break-words">
                {message.error}
              </span>
            </div>
          </div>
        )}

        <div className="w-full">
          {message.content ? (
            <div className="bg-[var(--bubble-agent)] border border-[var(--border)] px-4 py-3 smooth-corners text-sm text-[var(--text-main)] whitespace-pre-wrap break-words leading-relaxed max-w-2xl shadow-sm">
              {message.content}
            </div>
          ) : isStreaming ? (
            <div className="p-2 text-[var(--text-muted)]">
              <LoadingDots />
            </div>
          ) : !message.tools || message.tools.length === 0 ? (
            !message.error && (
              <div className="bg-[var(--bubble-agent)]/30 border border-dashed border-[var(--border)] px-3 py-2 smooth-corners text-xs text-[var(--text-muted)] italic max-w-2xl">
                No response generated.
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
};
