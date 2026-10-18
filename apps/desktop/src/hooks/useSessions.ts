import { useState, useEffect } from "react";
import type { Session, ChatMessage } from "../types/chat.js";

const SESSIONS_KEY = "cobot_sessions";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>(() => {
    try {
      const saved = localStorage.getItem(SESSIONS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Fallback
    }
    const initial: Session = {
      id: `session_${Date.now()}`,
      title: "New Session",
      createdAt: Date.now(),
      messages: [],
    };
    return [initial];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return sessions[0]?.id || `session_${Date.now()}`;
  });

  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch (err) {
      console.error("Failed to save sessions to localStorage:", err);
    }
  }, [sessions]);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const createSession = (): string => {
    const newSession: Session = {
      id: `session_${Date.now()}`,
      title: "New Session",
      createdAt: Date.now(),
      messages: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    return newSession.id;
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fallback: Session = {
          id: `session_${Date.now()}`,
          title: "New Session",
          createdAt: Date.now(),
          messages: [],
        };
        setActiveSessionId(fallback.id);
        return [fallback];
      }
      if (activeSessionId === id) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  };

  const updateSessionMessages = (
    sessionId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[],
  ) => {
    setSessions((prev) =>
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
    sessions,
    activeSessionId,
    activeSession,
    setActiveSessionId,
    createSession,
    deleteSession,
    updateSessionMessages,
  };
}
