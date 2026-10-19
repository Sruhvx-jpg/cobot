import { useState, useEffect } from "react";
import type { Session, ChatMessage } from "../types/chat.js";

const SESSIONS_KEY = "cobot_sessions";
const DEFAULT_AGENT_ID = "default";

export function useSessions(activeAgentId = DEFAULT_AGENT_ID) {
  const [allSessions, setAllSessions] = useState<Session[]>(() => {
    try {
      const saved = localStorage.getItem(SESSIONS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Session[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s) => ({
            ...s,
            agentId: s.agentId || DEFAULT_AGENT_ID,
          }));
        }
      }
    } catch {
      // Fallback
    }
    const initial: Session = {
      id: `session_${Date.now()}`,
      agentId: activeAgentId,
      title: "New Session",
      createdAt: Date.now(),
      messages: [],
    };
    return [initial];
  });

  // Filter sessions strictly belonging to the currently active agent
  const visibleSessions = allSessions.filter(
    (s) => (s.agentId || DEFAULT_AGENT_ID) === activeAgentId,
  );

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return visibleSessions[0]?.id || `session_${Date.now()}`;
  });

  // Ensure an active session exists when switching agents
  useEffect(() => {
    if (visibleSessions.length === 0) {
      const newSession: Session = {
        id: `session_${Date.now()}`,
        agentId: activeAgentId,
        title: "New Session",
        createdAt: Date.now(),
        messages: [],
      };
      setAllSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
    } else {
      const stillActive = visibleSessions.some((s) => s.id === activeSessionId);
      if (!stillActive) {
        setActiveSessionId(visibleSessions[0].id);
      }
    }
  }, [activeAgentId]);

  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(allSessions));
    } catch (err) {
      console.error("Failed to save sessions to localStorage:", err);
    }
  }, [allSessions]);

  const activeSession: Session = visibleSessions.find(
    (s) => s.id === activeSessionId,
  ) ||
    visibleSessions[0] || {
      id: `session_${Date.now()}`,
      agentId: activeAgentId,
      title: "New Session",
      createdAt: Date.now(),
      messages: [],
    };

  const createSession = (targetAgentId = activeAgentId): string => {
    const newSession: Session = {
      id: `session_${Date.now()}`,
      agentId: targetAgentId,
      title: "New Session",
      createdAt: Date.now(),
      messages: [],
    };
    setAllSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    return newSession.id;
  };

  const deleteSession = (id: string) => {
    setAllSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fallback: Session = {
          id: `session_${Date.now()}`,
          agentId: activeAgentId,
          title: "New Session",
          createdAt: Date.now(),
          messages: [],
        };
        setActiveSessionId(fallback.id);
        return [fallback];
      }
      return remaining;
    });
  };

  const updateSessionMessages = (
    sessionId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[],
  ) => {
    setAllSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const nextMessages = updater(s.messages);
        // Auto-title session from first user message
        let title = s.title;
        if (title === "New Session" && nextMessages.length > 0) {
          const firstUser = nextMessages.find((m) => m.role === "user");
          if (firstUser) {
            title = firstUser.content.slice(0, 24);
          }
        }
        return { ...s, messages: nextMessages, title };
      }),
    );
  };

  return {
    sessions: visibleSessions,
    allSessions,
    activeSessionId,
    activeSession,
    setActiveSessionId,
    createSession,
    deleteSession,
    updateSessionMessages,
  };
}
