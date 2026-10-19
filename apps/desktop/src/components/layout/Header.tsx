import React from "react";
import { PanelLeftOpen } from "lucide-react";
import { AuthButton } from "../controls/AuthButton.js";
import { AgentSwitcher } from "../controls/AgentSwitcher.js";
import type { AuthStatus, AgentOption } from "../../types/chat.js";

interface HeaderProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  authStatus: AuthStatus;
  onRefreshAuth: () => void;
  agents: AgentOption[];
  currentAgent: AgentOption | null;
  onSelectAgent: (agent: AgentOption) => void;
  onRefreshAgents: () => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({
  isSidebarOpen,
  onToggleSidebar,
  authStatus,
  onRefreshAuth,
  agents,
  currentAgent,
  onSelectAgent,
  onRefreshAgents,
}) => {
  return (
    <header className="h-12 border-b border-[var(--border)] bg-[var(--bg-main)] flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        {!isSidebarOpen && (
          <button
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] smooth-corners-sm transition-colors cursor-pointer"
            onClick={onToggleSidebar}
            title="Open sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
      </div>

      {/* Top-Right action controls: Agent Switcher + Auth */}
      <div className="flex items-center gap-2">
        <AgentSwitcher
          agents={agents}
          currentAgent={currentAgent}
          onSelectAgent={onSelectAgent}
          onRefreshAgents={onRefreshAgents}
        />
        <AuthButton authStatus={authStatus} onRefreshAuth={onRefreshAuth} />
      </div>
    </header>
  );
};
