import React, { useState } from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";

interface ReasoningBlockProps {
  reasoning: string;
}

export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({
  reasoning,
}) => {
  const [expanded, setExpanded] = useState(true);

  if (!reasoning) return null;

  return (
    <div className="border border-[var(--border)] smooth-corners-sm bg-[var(--bg-card)] overflow-hidden my-2 max-w-2xl">
      <button
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer select-none bg-transparent"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <Brain size={13} className="opacity-70" />
        <span className="tracking-wide">THOUGHTS</span>
        <span className="ml-auto opacity-50">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-xs font-mono text-[var(--text-muted)] border-t border-[var(--border)] whitespace-pre-wrap break-words max-h-56 overflow-y-auto leading-relaxed bg-[var(--bg-main)]">
          {reasoning}
        </pre>
      )}
    </div>
  );
};
