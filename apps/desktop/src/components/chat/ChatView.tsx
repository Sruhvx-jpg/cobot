import React from "react";
import type {
  ChatMessage,
  ModelOption,
  ThinkingLevel,
} from "../../types/chat.js";
import { MessageList } from "./MessageList.js";
import { ChatInput } from "./ChatInput.js";
import { SteerInput } from "./SteerInput.js";
import { useCobotStore } from "../../store/index.js";

interface ChatViewProps {
  messages?: ChatMessage[];
  isStreaming?: boolean;
  models?: ModelOption[];
  currentModel?: ModelOption | null;
  onModelChange?: (model: ModelOption) => void;
  thinkingLevel?: ThinkingLevel;
  onThinkingLevelChange?: (level: ThinkingLevel) => void;
  onSend?: (text: string) => void;
  onSteer?: (message: string) => Promise<void>;
}

export const ChatView: React.FC<ChatViewProps> = (props) => {
  const activeSession = useCobotStore((s) => s.getActiveSession());
  const storeMessages = activeSession.messages;
  const storeIsStreaming = useCobotStore((s) => s.isStreaming);
  const storeModels = useCobotStore((s) => s.models);
  const storeCurrentModel = useCobotStore((s) => s.currentModel);
  const storeSetModel = useCobotStore((s) => s.setCurrentModel);
  const storeThinkingLevel = useCobotStore((s) => s.thinkingLevel);
  const storeSetThinkingLevel = useCobotStore((s) => s.setThinkingLevel);
  const storeSend = useCobotStore((s) => s.sendMessage);
  const storeSteer = useCobotStore((s) => s.steerActiveSession);

  const messages = props.messages || storeMessages;
  const isStreaming =
    props.isStreaming !== undefined ? props.isStreaming : storeIsStreaming;
  const models = props.models || storeModels;
  const currentModel =
    props.currentModel !== undefined ? props.currentModel : storeCurrentModel;
  const onModelChange = props.onModelChange || storeSetModel;
  const thinkingLevel = props.thinkingLevel || storeThinkingLevel;
  const onThinkingLevelChange =
    props.onThinkingLevelChange || storeSetThinkingLevel;
  const onSend = props.onSend || storeSend;
  const onSteer = props.onSteer || storeSteer;
  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-main)]">
      <MessageList messages={messages} isStreaming={isStreaming} />
      <div className="p-4 pb-6 bg-transparent flex flex-col gap-1 w-full max-w-5xl mx-auto px-6">
        {isStreaming ? (
          <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-200">
            <SteerInput onSteer={onSteer} />
          </div>
        ) : (
          <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-200">
            <ChatInput
              onSend={onSend}
              models={models}
              currentModel={currentModel}
              onModelChange={onModelChange}
              thinkingLevel={thinkingLevel}
              onThinkingLevelChange={onThinkingLevelChange}
              disabled={isStreaming}
            />
          </div>
        )}
      </div>
    </main>
  );
};
