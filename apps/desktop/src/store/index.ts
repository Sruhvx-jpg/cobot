import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ChatMessage,
  Session,
  ModelOption,
  AgentOption,
  AuthStatus,
  ThinkingLevel,
} from "../types/chat.js";

const DEFAULT_ENDPOINT = "http://localhost:3000";
const DEFAULT_AGENT_ID = "default";

let activeAbortController: AbortController | null = null;

export interface CobotStore {
  // --- Endpoint ---
  endpoint: string;
  setEndpoint: (url: string) => void;
  apiUrl: (path: string) => string;
  isRemote: () => boolean;

  // --- Auth ---
  authStatus: AuthStatus;
  setAuthStatus: (status: AuthStatus) => void;
  refreshAuth: () => Promise<void>;

  // --- Agents ---
  agents: AgentOption[];
  currentAgent: AgentOption | null;
  setAgents: (agents: AgentOption[]) => void;
  setCurrentAgent: (agent: AgentOption | null) => void;
  refreshAgents: () => Promise<void>;

  // --- Models & Thinking ---
  models: ModelOption[];
  currentModel: ModelOption | null;
  thinkingLevel: ThinkingLevel;
  setModels: (models: ModelOption[]) => void;
  setCurrentModel: (model: ModelOption | null) => void;
  setThinkingLevel: (level: ThinkingLevel) => void;
  refreshModels: () => Promise<void>;

  // --- Sessions ---
  sessions: Session[];
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  createSession: (agentId?: string) => string;
  deleteSession: (id: string) => void;
  updateSessionMessages: (
    sessionId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[],
  ) => void;
  getActiveSession: () => Session;

  // --- Streaming ---
  isStreaming: boolean;
  sendMessage: (prompt: string) => Promise<void>;
  steerActiveSession: (message: string) => Promise<void>;
  stopStreaming: () => void;

  // --- UI & Modals ---
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  isNodeModalOpen: boolean;
  setNodeModalOpen: (open: boolean) => void;
  isQrModalOpen: boolean;
  setQrModalOpen: (open: boolean) => void;
  isNodeModalExpanded: boolean;
  setNodeModalExpanded: (expanded: boolean) => void;
}

export const useCobotStore = create<CobotStore>()(
  persist(
    (set, get) => ({
      // --- Endpoint ---
      endpoint: DEFAULT_ENDPOINT,
      setEndpoint: (url: string) => {
        const trimmed = url.trim().replace(/\/+$/, "");
        set({ endpoint: trimmed || DEFAULT_ENDPOINT });
      },
      apiUrl: (path: string) => {
        const base = get().endpoint;
        if (!path) return base;
        const cleanPath = path.startsWith("/") ? path : `/${path}`;
        return `${base}${cleanPath}`;
      },
      isRemote: () => {
        const ep = get().endpoint;
        return (
          ep !== DEFAULT_ENDPOINT &&
          !ep.startsWith("http://localhost") &&
          !ep.startsWith("http://127.0.0.1")
        );
      },

      // --- Auth ---
      authStatus: { authenticated: false },
      setAuthStatus: (status) => set({ authStatus: status }),
      refreshAuth: async () => {
        try {
          const res = await fetch(get().apiUrl("/api/auth/status"));
          if (res.ok) {
            const data = await res.json();
            set({ authStatus: data });
          }
        } catch {
          // Keep current state
        }
      },

      // --- Agents ---
      agents: [],
      currentAgent: null,
      setAgents: (agents) => set({ agents }),
      setCurrentAgent: (agent) => set({ currentAgent: agent }),
      refreshAgents: async () => {
        try {
          const res = await fetch(get().apiUrl("/api/agents"));
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.agents)) {
              set({ agents: data.agents });
              const current = get().currentAgent;
              if (
                !current ||
                !data.agents.some((a: AgentOption) => a.id === current.id)
              ) {
                set({ currentAgent: data.agents[0] || null });
              }
            }
          }
        } catch {
          // Backend initializing
        }
      },

      // --- Models ---
      models: [],
      currentModel: null,
      thinkingLevel: "medium",
      setModels: (models) => set({ models }),
      setCurrentModel: (model) => set({ currentModel: model }),
      setThinkingLevel: (level) => set({ thinkingLevel: level }),
      refreshModels: async () => {
        try {
          const res = await fetch(get().apiUrl("/api/models"));
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.models)) {
              set({ models: data.models });
              if (!get().currentModel && data.models.length > 0) {
                set({ currentModel: data.models[0] });
              }
            }
          }
        } catch {
          // Backend initializing
        }
      },

      // --- Sessions ---
      sessions: [
        {
          id: `session_${Date.now()}`,
          agentId: DEFAULT_AGENT_ID,
          title: "New Session",
          createdAt: Date.now(),
          messages: [],
        },
      ],
      activeSessionId: `session_${Date.now()}`,
      setActiveSessionId: (id) => set({ activeSessionId: id }),
      createSession: (agentId = DEFAULT_AGENT_ID) => {
        const newSession: Session = {
          id: `session_${Date.now()}`,
          agentId,
          title: "New Session",
          createdAt: Date.now(),
          messages: [],
        };
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          activeSessionId: newSession.id,
        }));
        return newSession.id;
      },
      deleteSession: (id) => {
        set((state) => {
          const remaining = state.sessions.filter((s) => s.id !== id);
          if (remaining.length === 0) {
            const fallback: Session = {
              id: `session_${Date.now()}`,
              agentId: state.currentAgent?.id || DEFAULT_AGENT_ID,
              title: "New Session",
              createdAt: Date.now(),
              messages: [],
            };
            return {
              sessions: [fallback],
              activeSessionId: fallback.id,
            };
          }
          const nextActive =
            state.activeSessionId === id
              ? remaining[0].id
              : state.activeSessionId;
          return {
            sessions: remaining,
            activeSessionId: nextActive,
          };
        });
      },
      updateSessionMessages: (sessionId, updater) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, messages: updater(s.messages) } : s,
          ),
        }));
      },
      getActiveSession: () => {
        const state = get();
        const active = state.sessions.find(
          (s) => s.id === state.activeSessionId,
        );
        return (
          active ||
          state.sessions[0] || {
            id: state.activeSessionId,
            agentId: state.currentAgent?.id || DEFAULT_AGENT_ID,
            title: "New Session",
            createdAt: Date.now(),
            messages: [],
          }
        );
      },

      // --- Streaming ---
      isStreaming: false,
      sendMessage: async (prompt: string) => {
        const state = get();
        if (state.isStreaming || !prompt.trim()) return;

        const session = state.getActiveSession();
        const sessionId = session.id;
        const currentModel = state.currentModel;
        const currentAgent = state.currentAgent;
        const thinkingLevel = state.thinkingLevel;

        const userMessage: ChatMessage = {
          id: `msg_user_${Date.now()}`,
          role: "user",
          content: prompt.trim(),
          timestamp: Date.now(),
        };

        const assistantMessageId = `msg_agent_${Date.now() + 1}`;
        const initialAssistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          timestamp: Date.now() + 1,
        };

        state.updateSessionMessages(sessionId, (prev) => [
          ...prev,
          userMessage,
          initialAssistantMessage,
        ]);

        set({ isStreaming: true });
        const controller = new AbortController();
        activeAbortController = controller;

        try {
          const res = await fetch(state.apiUrl("/api/agent/stream"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: prompt.trim(),
              sessionId,
              agentId: currentAgent?.id || "default",
              modelName: currentModel?.id,
              provider: currentModel?.provider,
              thinkingLevel,
            }),
            signal: controller.signal,
          });

          if (!res.ok || !res.body) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";

          const handleEvent = (event: any) => {
            switch (event.type) {
              case "TEXT_MESSAGE_CONTENT": {
                const delta = event.delta || "";
                state.updateSessionMessages(sessionId, (prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + delta }
                      : msg,
                  ),
                );
                break;
              }

              case "REASONING_MESSAGE_CONTENT": {
                const delta = event.delta || "";
                state.updateSessionMessages(sessionId, (prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, reasoning: (msg.reasoning || "") + delta }
                      : msg,
                  ),
                );
                break;
              }

              case "TOOL_CALL_START": {
                const { toolCallId, toolName, args } = event;
                state.updateSessionMessages(sessionId, (prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantMessageId) return msg;
                    const tools = msg.tools ? [...msg.tools] : [];
                    tools.push({
                      id: toolCallId,
                      name: toolName,
                      args,
                      status: "running",
                    });
                    return { ...msg, tools };
                  }),
                );
                break;
              }

              case "TOOL_CALL_RESULT": {
                const { toolCallId, isError, durationMs } = event;
                state.updateSessionMessages(sessionId, (prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantMessageId) return msg;
                    const tools = (msg.tools || []).map((t) =>
                      t.id === toolCallId
                        ? {
                            ...t,
                            status: isError
                              ? ("error" as const)
                              : ("completed" as const),
                            isError: !!isError,
                            durationMs,
                          }
                        : t,
                    );
                    return { ...msg, tools };
                  }),
                );
                break;
              }

              case "RUN_ERROR": {
                const errText =
                  event.error || "An unknown execution error occurred.";
                state.updateSessionMessages(sessionId, (prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, error: errText }
                      : msg,
                  ),
                );
                break;
              }

              case "RUN_FINISHED": {
                set({ isStreaming: false });
                break;
              }
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr) continue;

              try {
                const event = JSON.parse(jsonStr);
                handleEvent(event);
              } catch {
                // Ignore malformed chunks
              }
            }
          }
        } catch (err: any) {
          if (err.name !== "AbortError") {
            state.updateSessionMessages(sessionId, (prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      error: err.message || "Failed to communicate with agent.",
                    }
                  : msg,
              ),
            );
          }
        } finally {
          set({ isStreaming: false });
          activeAbortController = null;
        }
      },

      steerActiveSession: async (message: string) => {
        const state = get();
        const active = state.getActiveSession();
        state.updateSessionMessages(active.id, (prev) => [
          ...prev,
          {
            id: `msg_steer_${Date.now()}`,
            role: "user",
            content: `[Steered]: ${message}`,
            timestamp: Date.now(),
          },
        ]);

        try {
          await fetch(state.apiUrl("/api/agent/steer"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: active.id, message }),
          });
        } catch (err) {
          console.error("[Store] Failed to steer agent:", err);
        }
      },

      stopStreaming: () => {
        if (activeAbortController) {
          activeAbortController.abort();
          activeAbortController = null;
        }
        set({ isStreaming: false });
      },

      // --- UI & Modals ---
      isSidebarOpen: true,
      toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
      isNodeModalOpen: false,
      setNodeModalOpen: (open) => set({ isNodeModalOpen: open }),
      isQrModalOpen: false,
      setQrModalOpen: (open) => set({ isQrModalOpen: open }),
      isNodeModalExpanded: false,
      setNodeModalExpanded: (expanded) =>
        set({ isNodeModalExpanded: expanded }),
    }),
    {
      name: "cobot-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        endpoint:
          state.endpoint.startsWith("http://localhost") ||
          state.endpoint.startsWith("http://127.0.0.1")
            ? state.endpoint
            : DEFAULT_ENDPOINT,
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        thinkingLevel: state.thinkingLevel,
      }),
    },
  ),
);
