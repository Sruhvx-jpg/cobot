import React from "react";
import { PanelLeftOpen, Server, QrCode, Info } from "lucide-react";
import { AuthButton } from "../controls/AuthButton.js";
import { AgentSwitcher } from "../controls/AgentSwitcher.js";
import { NodeManagerModal } from "../controls/NodeManagerModal.js";
import { MobilePairingModal } from "../controls/MobilePairingModal.js";
import { useCobotStore } from "../../store/index.js";

export const Header: React.FC = () => {
  const isSidebarOpen = useCobotStore((s) => s.isSidebarOpen);
  const toggleSidebar = useCobotStore((s) => s.toggleSidebar);
  const authStatus = useCobotStore((s) => s.authStatus);
  const refreshAuth = useCobotStore((s) => s.refreshAuth);
  const agents = useCobotStore((s) => s.agents);
  const currentAgent = useCobotStore((s) => s.currentAgent);
  const setCurrentAgent = useCobotStore((s) => s.setCurrentAgent);
  const refreshAgents = useCobotStore((s) => s.refreshAgents);
  const isNodeModalOpen = useCobotStore((s) => s.isNodeModalOpen);
  const setNodeModalOpen = useCobotStore((s) => s.setNodeModalOpen);
  const isQrModalOpen = useCobotStore((s) => s.isQrModalOpen);
  const setQrModalOpen = useCobotStore((s) => s.setQrModalOpen);
  const sendMessage = useCobotStore((s) => s.sendMessage);
  const endpoint = useCobotStore((s) => s.endpoint);
  const isRemote = useCobotStore((s) => s.isRemote());

  return (
    <header className="h-12 border-b border-[var(--border)] bg-[var(--bg-main)] flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        {!isSidebarOpen && (
          <button
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] smooth-corners-sm transition-colors cursor-pointer"
            onClick={toggleSidebar}
            title="Open sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
      </div>

      {/* Top-Right action controls: Seed VM + Mobile QR + Agent Switcher + Auth */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setNodeModalOpen(true)}
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
          onClick={() => setQrModalOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          title="Pair Cobot Mobile App (QR Code)"
        >
          <QrCode size={14} className="text-orange-400" />
          <span className="hidden sm:inline">Mobile QR</span>
        </button>

        <AgentSwitcher
          agents={agents}
          currentAgent={currentAgent}
          onSelectAgent={setCurrentAgent}
          onRefreshAgents={refreshAgents}
        />
        <AuthButton authStatus={authStatus} onRefreshAuth={refreshAuth} />

        <NodeManagerModal
          isOpen={isNodeModalOpen}
          onClose={() => setNodeModalOpen(false)}
          authStatus={authStatus}
          onInstructAgent={sendMessage}
        />
        <MobilePairingModal
          isOpen={isQrModalOpen}
          onClose={() => setQrModalOpen(false)}
        />
      </div>
    </header>
  );
};
