import React, { useState } from "react";
import { PanelLeftOpen, Server, QrCode, Info } from "lucide-react";
import { AuthButton } from "../controls/AuthButton.js";
import { AgentSwitcher } from "../controls/AgentSwitcher.js";
import { NodeManagerModal } from "../controls/NodeManagerModal.js";
import { MobilePairingModal } from "../controls/MobilePairingModal.js";
import { useEndpoint } from "../../context/EndpointContext.js";
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
  onInstructAgent?: (prompt: string) => void;
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
  onInstructAgent,
}) => {
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const { isRemote, endpoint } = useEndpoint();

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

      {/* Top-Right action controls: Seed VM + Mobile QR + Agent Switcher + Auth */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsNodeModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-main)] hover:border-orange-500/50 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group"
          title="Your agent will seed the agent daemon and its ecosystem to your preferred VM."
        >
          <Server size={14} className="text-orange-400" />
          <span>Seed to VM</span>
          <Info
            size={12}
            className="text-[var(--text-muted)] group-hover:text-orange-400 transition-colors ml-0.5"
          />
        </button>

        <button
          onClick={() => setIsQrModalOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          title="Pair Cobot Mobile App (QR Code)"
        >
          <QrCode size={14} className="text-orange-400" />
          <span className="hidden sm:inline">Mobile QR</span>
        </button>

        <AgentSwitcher
          agents={agents}
          currentAgent={currentAgent}
          onSelectAgent={onSelectAgent}
          onRefreshAgents={onRefreshAgents}
        />
        <AuthButton authStatus={authStatus} onRefreshAuth={onRefreshAuth} />

        <NodeManagerModal
          isOpen={isNodeModalOpen}
          onClose={() => setIsNodeModalOpen(false)}
          authStatus={authStatus}
          onInstructAgent={onInstructAgent}
        />
        <MobilePairingModal
          isOpen={isQrModalOpen}
          onClose={() => setIsQrModalOpen(false)}
        />
      </div>
    </header>
  );
};
