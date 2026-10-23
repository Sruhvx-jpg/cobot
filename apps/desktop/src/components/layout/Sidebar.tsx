import React from "react";
import { Plus, PanelLeftClose } from "lucide-react";
import { SessionItem } from "./SessionItem.js";
import { ThemeSwitcher } from "../controls/ThemeSwitcher.js";
import { useCobotStore } from "../../store/index.js";
import type { Session } from "../../types/chat.js";

interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
  sessions?: Session[];
  activeSessionId?: string | null;
  onSelectSession?: (id: string) => void;
  onNewSession?: () => void;
  onDeleteSession?: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = (props) => {
  const storeIsOpen = useCobotStore((s) => s.isSidebarOpen);
  const storeToggle = useCobotStore((s) => s.toggleSidebar);
  const storeSessions = useCobotStore((s) => s.sessions);
  const storeActiveId = useCobotStore((s) => s.activeSessionId);
  const storeSelect = useCobotStore((s) => s.setActiveSessionId);
  const storeNew = useCobotStore((s) => s.createSession);
  const storeDelete = useCobotStore((s) => s.deleteSession);

  const isOpen = props.isOpen !== undefined ? props.isOpen : storeIsOpen;
  const onToggle = props.onToggle || storeToggle;
  const sessions = props.sessions || storeSessions;
  const activeSessionId =
    props.activeSessionId !== undefined ? props.activeSessionId : storeActiveId;
  const onSelectSession = props.onSelectSession || storeSelect;
  const onNewSession = props.onNewSession || (() => storeNew());
  const onDeleteSession = props.onDeleteSession || storeDelete;
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
