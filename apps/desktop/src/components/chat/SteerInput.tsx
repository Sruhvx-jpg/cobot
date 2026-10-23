import React, { useState } from "react";
import { Compass, Check, Square } from "lucide-react";
import { useCobotStore } from "../../store/index.js";

interface SteerInputProps {
  onSteer: (message: string) => Promise<void>;
  disabled?: boolean;
}

export const SteerInput: React.FC<SteerInputProps> = ({
  onSteer,
  disabled = false,
}) => {
  const [text, setText] = useState("");
  const [steeredFeedback, setSteeredFeedback] = useState(false);
  const stopStreaming = useCobotStore((s) => s.stopStreaming);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    const msg = text.trim();
    setText("");
    await onSteer(msg);
    setSteeredFeedback(true);
    setTimeout(() => setSteeredFeedback(false), 2000);
  };

  return (
    <form
      className="flex items-center gap-3 px-4 py-3 border border-[var(--border)] hover:border-[var(--border-hover)] focus-within:border-[var(--border-focus)] smooth-corners-lg bg-[var(--bg-card)]/50 backdrop-blur-xs transition-all max-w-5xl mx-auto w-full shadow-sm"
      onSubmit={handleSubmit}
    >
      <Compass
        size={16}
        className="text-[var(--text-muted)] flex-shrink-0 animate-spin [animation-duration:8s]"
      />
      <input
        type="text"
        className="flex-1 bg-transparent border-none text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-subtle)] leading-relaxed"
        placeholder="Steer active agent run (inject mid-turn instruction or course-correct)..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
      />
      <button
        type="submit"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--border-hover)] smooth-corners-sm text-xs font-semibold text-[var(--text-main)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        disabled={!text.trim() || disabled}
      >
        {steeredFeedback ? (
          <>
            <Check size={13} className="text-emerald-400" />
            <span className="text-emerald-400">STEERED</span>
          </>
        ) : (
          <span>STEER</span>
        )}
      </button>

      <button
        type="button"
        onClick={stopStreaming}
        className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 rounded-lg text-xs font-semibold text-red-400 transition-colors cursor-pointer"
        title="Stop current agent run"
      >
        <Square size={12} className="fill-red-400" />
        <span>STOP</span>
      </button>
    </form>
  );
};
