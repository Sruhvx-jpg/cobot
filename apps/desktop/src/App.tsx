import React, { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./components/layout/Sidebar.js";
import { Header } from "./components/layout/Header.js";
import { ChatView } from "./components/chat/ChatView.js";
import { useSessions } from "./hooks/useSessions.js";
import { useAgentStream } from "./hooks/useAgentStream.js";
import type {
  ModelOption,
  AuthStatus,
  AgentOption,
  ThinkingLevel,
} from "./types/chat.js";

export const App: React.FC = () => {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [currentAgent, setCurrentAgent] = useState<AgentOption | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("medium");

  const {
    sessions,
    activeSessionId,
    activeSession,
    setActiveSessionId,
    createSession,
    deleteSession,
    updateSessionMessages,
  } = useSessions(currentAgent?.id || "default");

  const { isStreaming, sendMessage, steerActiveSession } = useAgentStream(
    updateSessionMessages,
  );

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [currentModel, setCurrentModel] = useState<ModelOption | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    authenticated: false,
  });

  const refreshAgents = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:3000/api/agents");
      const data = await res.json();
      if (data.agents && data.agents.length > 0) {
        setAgents(data.agents);
        setCurrentAgent((prev) => {
          if (!prev) return data.agents[0];
          const matched = data.agents.find(
            (a: AgentOption) => a.id === prev.id,
          );
          return matched || data.agents[0];
        });
      }
    } catch {
      // Backend initializing
    }
  }, []);

  const refreshAuthAndModels = useCallback(async () => {
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
      // Backend initializing
    }
  }, []);

  useEffect(() => {
    refreshAuthAndModels();
    refreshAgents();
  }, [refreshAuthAndModels, refreshAgents]);

  const handleSend = (text: string) => {
    sendMessage(
      text,
      currentModel,
      activeSession.id,
      currentAgent?.id,
      thinkingLevel,
    );
  };

  const handleSteer = async (message: string) => {
    updateSessionMessages(activeSession.id, (prev) => [
      ...prev,
      {
        id: `msg_steer_${Date.now()}`,
        role: "user",
        content: `[Steered]: ${message}`,
        timestamp: Date.now(),
      },
    ]);
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
        onNewSession={() => createSession(currentAgent?.id || "default")}
        onDeleteSession={deleteSession}
      />
      <div className="flex-1 h-full flex flex-col bg-[var(--bg-main)] overflow-hidden">
        <Header
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          authStatus={authStatus}
          onRefreshAuth={refreshAuthAndModels}
          agents={agents}
          currentAgent={currentAgent}
          onSelectAgent={setCurrentAgent}
          onRefreshAgents={refreshAgents}
        />
        <ChatView
          messages={activeSession.messages}
          isStreaming={isStreaming}
          models={models}
          currentModel={currentModel}
          onModelChange={setCurrentModel}
          thinkingLevel={thinkingLevel}
          onThinkingLevelChange={setThinkingLevel}
          onSend={handleSend}
          onSteer={handleSteer}
        />
      </div>
    </div>
  );
};
