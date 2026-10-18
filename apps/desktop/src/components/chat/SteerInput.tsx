import React, { useState } from "react";
import { Compass, Check } from "lucide-react";

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
      className="flex items-center gap-2 px-3 py-1.5 border border-[var(--border)] hover:border-[var(--border-hover)] smooth-corners-sm bg-transparent transition-colors max-w-3xl mx-auto w-full mb-2"
      onSubmit={handleSubmit}
    >
      <Compass
        size={14}
        className="text-[var(--text-muted)] flex-shrink-0 animate-spin [animation-duration:8s]"
      />
      <input
        type="text"
        className="flex-1 bg-transparent border-none text-xs text-[var(--text-main)] outline-none placeholder:text-[var(--text-subtle)]"
        placeholder="Steer active agent run (inject instruction mid-turn)..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
      />
      <button
        type="submit"
        className="flex items-center gap-1 px-2.5 py-1 bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--border-hover)] smooth-corners-sm text-[10px] font-bold text-[var(--text-main)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        disabled={!text.trim() || disabled}
      >
        {steeredFeedback ? (
          <>
            <Check size={11} />
            <span>STEERED</span>
          </>
        ) : (
          <span>STEER</span>
        )}
      </button>
    </form>
  );
};
