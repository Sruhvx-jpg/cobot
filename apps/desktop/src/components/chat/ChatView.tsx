import React from "react";
import type { ChatMessage, ModelOption } from "../../types/chat.js";
import { MessageList } from "./MessageList.js";
import { ChatInput } from "./ChatInput.js";
import { SteerInput } from "./SteerInput.js";

interface ChatViewProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  models: ModelOption[];
  currentModel: ModelOption | null;
  onModelChange: (model: ModelOption) => void;
  onSend: (text: string) => void;
  onSteer: (message: string) => Promise<void>;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  isStreaming,
  models,
  currentModel,
  onModelChange,
  onSend,
  onSteer,
}) => {
  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-main)]">
      <MessageList messages={messages} isStreaming={isStreaming} />
      <div className="p-4 pb-6 bg-transparent flex flex-col gap-1 w-full max-w-6xl mx-auto px-6">
        {isStreaming && <SteerInput onSteer={onSteer} />}
        <ChatInput
          onSend={onSend}
          models={models}
          currentModel={currentModel}
          onModelChange={onModelChange}
          disabled={isStreaming}
        />
      </div>
    </main>
  );
};
