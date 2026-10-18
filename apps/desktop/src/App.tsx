import React, { useState, useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar.js";
import { Header } from "./components/layout/Header.js";
import { ChatView } from "./components/chat/ChatView.js";
import { useSessions } from "./hooks/useSessions.js";
import { useAgentStream } from "./hooks/useAgentStream.js";
import type { ModelOption, AuthStatus } from "./types/chat.js";

export const App: React.FC = () => {
  const {
    sessions,
    activeSessionId,
    activeSession,
    setActiveSessionId,
    createSession,
    deleteSession,
    updateSessionMessages,
  } = useSessions();

  const { isStreaming, sendMessage, steerActiveSession } = useAgentStream(
    updateSessionMessages,
  );

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [currentModel, setCurrentModel] = useState<ModelOption | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    authenticated: false,
  });

  const refreshAuthAndModels = async () => {
    try {
      const [authRes, modelsRes] = await Promise.all([
        fetch("http://localhost:3000/api/auth/status"),
        fetch("http://localhost:3000/api/models"),
      ]);
      const authData = await authRes.json();
      const modelsData = await modelsRes.json();

      setAuthStatus(authData);
      setModels(modelsData.models || []);

      if (modelsData.models && modelsData.models.length > 0) {
        setCurrentModel((prev) => prev || modelsData.models[0]);
      } else {
        setCurrentModel(null);
      }
    } catch {
      // Backend starting up
    }
  };

  useEffect(() => {
    refreshAuthAndModels();
  }, []);

  const handleSend = (text: string) => {
    sendMessage(text, currentModel, activeSession.id);
  };

  const handleSteer = async (message: string) => {
    await steerActiveSession(activeSession.id, message);
  };

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-[var(--bg-main)] text-[var(--text-main)] select-none">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((prev) => !prev)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewSession={createSession}
        onDeleteSession={deleteSession}
      />
      <div className="flex-1 h-full flex flex-col bg-[var(--bg-main)] overflow-hidden">
        <Header
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          authStatus={authStatus}
          onRefreshAuth={refreshAuthAndModels}
        />
        <ChatView
          messages={activeSession.messages}
          isStreaming={isStreaming}
          models={models}
          currentModel={currentModel}
          onModelChange={setCurrentModel}
          onSend={handleSend}
          onSteer={handleSteer}
        />
      </div>
    </div>
  );
};
