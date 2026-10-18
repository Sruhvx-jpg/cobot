import React, { useState, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { ModelSwitcher } from "../controls/ModelSwitcher.js";
import type { ModelOption } from "../../types/chat.js";

interface ChatInputProps {
  onSend: (text: string) => void;
  models: ModelOption[];
  currentModel: ModelOption | null;
  onModelChange: (model: ModelOption) => void;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  models,
  currentModel,
  onModelChange,
  disabled = false,
}) => {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="relative flex flex-col border border-[var(--border)] hover:border-[var(--border-hover)] focus-within:border-[var(--border-focus)] smooth-corners-lg bg-transparent transition-colors p-3.5 max-w-5xl mx-auto w-full">
      <textarea
        ref={textareaRef}
        className="w-full bg-transparent text-[var(--text-main)] placeholder:text-[var(--text-subtle)] text-sm outline-none resize-none px-2 py-1 leading-relaxed min-h-[56px] max-h-48"
        placeholder="Type a message or instruction..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        disabled={disabled}
      />
      <div className="flex items-center justify-between pt-2.5 border-t border-[var(--border)] border-opacity-50 mt-1">
        <div className="flex items-center gap-2">
          <ModelSwitcher
            models={models}
            currentModel={currentModel}
            onModelChange={onModelChange}
            disabled={disabled}
          />
        </div>
        <button
          className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--text-main)] text-[var(--bg-main)] hover:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed transition-all cursor-pointer flex-shrink-0"
          onClick={handleSubmit}
          disabled={!input.trim() || disabled}
          title="Send prompt"
        >
          <ArrowUp size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};
