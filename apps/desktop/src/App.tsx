import React, { useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar.js";
import { Header } from "./components/layout/Header.js";
import { ChatView } from "./components/chat/ChatView.js";
import { useCobotStore } from "./store/index.js";

export const App: React.FC = () => {
  const refreshAuth = useCobotStore((s) => s.refreshAuth);
  const refreshAgents = useCobotStore((s) => s.refreshAgents);
  const refreshModels = useCobotStore((s) => s.refreshModels);

  useEffect(() => {
    refreshAuth();
    refreshAgents();
    refreshModels();
  }, [refreshAuth, refreshAgents, refreshModels]);

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-[var(--bg-main)] text-[var(--text-main)] select-none">
      <Sidebar />
      <div className="flex-1 h-full flex flex-col bg-[var(--bg-main)] overflow-hidden">
        <Header />
        <ChatView />
      </div>
    </div>
  );
};
