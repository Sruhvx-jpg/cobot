import { useState, useRef } from "react";
import type { ChatMessage, ModelOption, ThinkingLevel } from "../types/chat.js";

export function useAgentStream(
  updateMessages: (
    sessionId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[],
  ) => void,
) {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = async (
    prompt: string,
    model: ModelOption | null,
    sessionId: string,
    agentId?: string,
    thinkingLevel?: ThinkingLevel,
  ) => {
    if (isStreaming) return;

    const userMessage: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };

    const assistantMessageId = `msg_asst_${Date.now()}`;
    const initialAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      tools: [],
      timestamp: Date.now(),
    };

    updateMessages(sessionId, (prev) => [
      ...prev,
      userMessage,
      initialAssistantMessage,
    ]);

    setIsStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("http://localhost:3000/api/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          sessionId,
          agentId,
          modelName: model?.id,
          provider: model?.provider,
          thinkingLevel,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(
          `HTTP error ${response.status}: ${response.statusText}`,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const match = line.match(/^data:\s*(.+)$/m);
          if (!match) continue;

          try {
            const event = JSON.parse(match[1]);
            switch (event.type) {
              case "TEXT_MESSAGE_CONTENT": {
                const delta = event.delta || "";
                updateMessages(sessionId, (prev) =>
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
                updateMessages(sessionId, (prev) =>
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
                updateMessages(sessionId, (prev) =>
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
                updateMessages(sessionId, (prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantMessageId) return msg;
                    const tools = (msg.tools || []).map((t) =>
                      t.id === toolCallId
                        ? {
                            ...t,
                            status: isError
                              ? ("error" as const)
                              : ("completed" as const),
                            isError,
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
                updateMessages(sessionId, (prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: msg.content + `\n[Error: ${event.message}]`,
                        }
                      : msg,
                  ),
                );
                break;
              }
            }
          } catch {
            // Ignore parse errors on keepalive comments
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        updateMessages(sessionId, (prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content:
                    msg.content +
                    `\n[Connection Error: ${(err as Error).message}]`,
                }
              : msg,
          ),
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const steerActiveSession = async (sessionId: string, message: string) => {
    try {
      await fetch("http://localhost:3000/api/agent/steer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
      });
    } catch (err) {
      console.error("Steering failed:", err);
    }
  };

  const abortStream = () => {
    abortControllerRef.current?.abort();
  };

  return {
    isStreaming,
    sendMessage,
    steerActiveSession,
    abortStream,
  };
}
