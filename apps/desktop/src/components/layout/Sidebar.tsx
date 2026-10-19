import React from "react";
import { Plus, PanelLeftClose } from "lucide-react";
import { SessionItem } from "./SessionItem.js";
import { ThemeSwitcher } from "../controls/ThemeSwitcher.js";
import type { Session } from "../../types/chat.js";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}) => {
  return (
    <aside
      className={`h-full bg-[var(--bg-main)] border-r border-[var(--border)] flex flex-col flex-shrink-0 transition-all duration-200 overflow-hidden ${
        isOpen ? "w-60 opacity-100" : "w-0 opacity-0 border-r-0"
      }`}
    >
      {/* Top action bar */}
      <div className="h-12 flex items-center justify-between px-3 border-b border-[var(--border)] flex-shrink-0">
        <button
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] smooth-corners-sm transition-colors cursor-pointer"
          onClick={onNewSession}
          title="New session"
        >
          <Plus size={16} />
        </button>

        <button
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] smooth-corners-sm transition-colors cursor-pointer"
          onClick={onToggle}
          title="Close sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onSelect={onSelectSession}
            onDelete={onDeleteSession}
          />
        ))}
      </div>

      {/* Downside of the sidebar: Theme Switcher */}
      <div className="p-3 border-t border-[var(--border)] flex items-center justify-between flex-shrink-0 bg-[var(--bg-main)]">
        <span className="text-xs text-[var(--text-muted)] font-medium">
          Theme
        </span>
        <ThemeSwitcher />
      </div>
    </aside>
  );
};
