import React from "react";

export const LoadingDots: React.FC = () => {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs opacity-75">
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" />
    </span>
  );
};
