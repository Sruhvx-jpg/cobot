import React from "react";
import { PanelLeftOpen } from "lucide-react";
import { ThemeSwitcher } from "../controls/ThemeSwitcher.js";
import { AuthButton } from "../controls/AuthButton.js";
import type { AuthStatus } from "../../types/chat.js";

interface HeaderProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  authStatus: AuthStatus;
  onRefreshAuth: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isSidebarOpen,
  onToggleSidebar,
  authStatus,
  onRefreshAuth,
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
      <div className="flex items-center gap-2">
        <AuthButton authStatus={authStatus} onRefreshAuth={onRefreshAuth} />
        <ThemeSwitcher />
      </div>
    </header>
  );
};
