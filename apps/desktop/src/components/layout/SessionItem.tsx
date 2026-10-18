import React from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import type { Session } from "../../types/chat.js";

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export const SessionItem: React.FC<SessionItemProps> = ({
  session,
  isActive,
  onSelect,
  onDelete,
}) => {
  return (
    <div
      className={`group flex items-center justify-between px-2.5 py-2 smooth-corners-sm transition-colors cursor-pointer border ${
        isActive
          ? "bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-main)]"
          : "border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]"
      }`}
      onClick={() => onSelect(session.id)}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
        <MessageSquare size={13} className="flex-shrink-0 opacity-70" />
        <span className="text-xs truncate text-left select-none font-medium">
          {session.title || "Untitled Session"}
        </span>
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 transition-opacity text-[var(--text-muted)] cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(session.id);
        }}
        title="Delete session"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
};
