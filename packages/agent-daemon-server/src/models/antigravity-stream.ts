import {
  createAssistantMessageEventStream,
  getCurrentTools,
  getCurrentSystemPrompt,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Model,
  type TranscriptContext,
  type SimpleStreamOptions,
  type TextContent,
  type ThinkingContent,
  type ToolCall,
} from "@earendil-works/pi-ai";
import { getStoredAuth } from "../auth/antigravity.js";

const ENDPOINT =
  "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse";
const USER_AGENT =
  "antigravity/cli/1.4.0 (aidev_client; os_type=linux; arch=amd64; cl=982146307; auth_method=consumer)";

function mergeConsecutiveTurns(
  contents: Array<{ role: "user" | "model"; parts: any[] }>,
) {
  const merged: Array<{ role: "user" | "model"; parts: any[] }> = [];
  for (const turn of contents) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      last.parts.push(...turn.parts);
    } else {
      merged.push({ role: turn.role, parts: [...turn.parts] });
    }
  }
  return merged;
}

function sanitizeGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;

  if (Array.isArray(schema)) {
    return schema.map(sanitizeGeminiSchema);
  }

  // Convert TypeBox anyOf: [{ const: "a" }, { const: "b" }] to enum: ["a", "b"]
  if (Array.isArray(schema.anyOf)) {
    const constVals = schema.anyOf
      .map((item: any) => item?.const ?? item?.enum?.[0])
      .filter((v: any) => v !== undefined);
    if (constVals.length === schema.anyOf.length) {
      const clean: Record<string, any> = {
        type: "string",
        enum: constVals,
      };
      if (schema.description) clean.description = schema.description;
      return clean;
    }
  }

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "$schema" || key === "additionalProperties") {
      continue;
    }
    if (key === "const") {
      clean.enum = [value];
      continue;
    }
    clean[key] = sanitizeGeminiSchema(value);
  }

  return clean;
}

export function streamAntigravity(
  model: Model<any>,
  context: TranscriptContext,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  (async () => {
    const auth = await getStoredAuth();
    if (!auth || !auth.access_token) {
      const err = new Error(
        "No active Antigravity session. Please click LOGIN to authenticate.",
      );
      const errorMsg: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: "" }],
        stopReason: "error",
        errorMessage: err.message,
        timestamp: Date.now(),
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      stream.end(errorMsg);
      return;
    }

    // Convert transcript messages for Google Gemini Antigravity format
    const rawContents: Array<{ role: "user" | "model"; parts: any[] }> = [];
    const systemPrompt = getCurrentSystemPrompt(context.messages) || "";

    for (const msg of context.messages) {
      if (msg.role === "system") continue;

      if (msg.role === "user") {
        const text =
          typeof msg.content === "string"
            ? msg.content
            : msg.content.map((c: any) => c.text || "").join("\n");
        rawContents.push({ role: "user", parts: [{ text: text || " " }] });
      } else if (msg.role === "assistant") {
        const parts: any[] = [];
        for (const block of msg.content) {
          if (block.type === "text" && block.text) {
            parts.push({ text: block.text });
          } else if (block.type === "toolCall") {
            const blockWithSig = block as any;
            parts.push({
              functionCall: {
                name: block.name,
                args:
                  typeof block.arguments === "string"
                    ? JSON.parse(block.arguments)
                    : (block.arguments ?? {}),
                ...(block.id ? { id: block.id } : {}),
              },
              ...(blockWithSig.thoughtSignature
                ? { thoughtSignature: blockWithSig.thoughtSignature }
                : {}),
            });
          }
        }
        if (parts.length > 0) {
          rawContents.push({ role: "model", parts });
        }
      } else if (msg.role === "toolResult") {
        const text =
          typeof msg.content === "string"
            ? msg.content
            : msg.content.map((c: any) => c.text || "").join("\n");
        rawContents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: msg.toolName,
                response: { output: text },
              },
            },
          ],
        });
      }
    }

    // Merge consecutive same-role turns to satisfy Gemini role alternation requirements
    const contents = mergeConsecutiveTurns(rawContents);

    // Map tools with schema sanitization
    const declaredTools = getCurrentTools(context.messages);
    const toolsPayload =
      declaredTools && declaredTools.length > 0
        ? [
            {
              functionDeclarations: declaredTools.map((t: any) => ({
                name: t.name,
                description: t.description,
                parameters: sanitizeGeminiSchema(t.parameters),
              })),
            },
          ]
        : undefined;

    const requestBody = {
      project: auth.projectId || "aicode-consumers",
      model: model.id,
      request: {
        contents,
        systemInstruction: systemPrompt
          ? { role: "user", parts: [{ text: systemPrompt }] }
          : undefined,
        tools: toolsPayload,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: model.maxTokens || 4096,
        },
      },
      requestType: "AGENT",
      userAgent: "antigravity",
    };

    const finalMessage: AssistantMessage = {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    };

    try {
      stream.push({ type: "start", partial: finalMessage });

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.access_token}`,
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify(requestBody),
        signal: options?.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(
          `Antigravity error (${res.status}): ${errBody.slice(0, 300)}`,
        );
      }

      if (!res.body) {
        throw new Error("No response body from Antigravity");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      let textContentIndex = -1;
      let currentText = "";
      let thinkingContentIndex = -1;
      let currentThinking = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.slice(6);
          if (jsonStr === "[DONE]") continue;

          try {
            const data = JSON.parse(jsonStr);
            const candidates = data.response?.candidates || [];
            if (candidates.length === 0) continue;

            const candidate = candidates[0];
            const parts = candidate.content?.parts || [];

            for (const part of parts) {
              // Reasoning / Thought delta
              if (part.thought) {
                if (thinkingContentIndex === -1) {
                  thinkingContentIndex = finalMessage.content.length;
                  finalMessage.content.push({
                    type: "thinking",
                    thinking: "",
                  } as ThinkingContent);
                  stream.push({
                    type: "thinking_start",
                    contentIndex: thinkingContentIndex,
                    partial: finalMessage,
                  });
                }
                const thoughtDelta = part.text || "";
                currentThinking += thoughtDelta;
                (
                  finalMessage.content[thinkingContentIndex] as ThinkingContent
                ).thinking = currentThinking;
                stream.push({
                  type: "thinking_delta",
                  contentIndex: thinkingContentIndex,
                  delta: thoughtDelta,
                  partial: finalMessage,
                });
              } else if (part.text) {
                // Text delta
                if (textContentIndex === -1) {
                  textContentIndex = finalMessage.content.length;
                  finalMessage.content.push({
                    type: "text",
                    text: "",
                  } as TextContent);
                  stream.push({
                    type: "text_start",
                    contentIndex: textContentIndex,
                    partial: finalMessage,
                  });
                }
                const delta = part.text;
                currentText += delta;
                (finalMessage.content[textContentIndex] as TextContent).text =
                  currentText;
                stream.push({
                  type: "text_delta",
                  contentIndex: textContentIndex,
                  delta,
                  partial: finalMessage,
                });
              } else if (part.functionCall) {
                // Tool Call
                const toolCallId =
                  part.functionCall.id ||
                  `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                const callBlock: ToolCall & { thoughtSignature?: string } = {
                  type: "toolCall",
                  id: toolCallId,
                  name: part.functionCall.name,
                  arguments: part.functionCall.args || {},
                  ...(part.thoughtSignature
                    ? { thoughtSignature: part.thoughtSignature }
                    : {}),
                };
                const toolIdx = finalMessage.content.length;
                finalMessage.content.push(callBlock);
                stream.push({
                  type: "toolcall_start",
                  contentIndex: toolIdx,
                  partial: finalMessage,
                });
                stream.push({
                  type: "toolcall_delta",
                  contentIndex: toolIdx,
                  delta: JSON.stringify(part.functionCall.args || {}),
                  partial: finalMessage,
                });
                stream.push({
                  type: "toolcall_end",
                  contentIndex: toolIdx,
                  toolCall: callBlock,
                  partial: finalMessage,
                });
              }
            }

            if (data.response?.usageMetadata) {
              finalMessage.usage = {
                input: data.response.usageMetadata.promptTokenCount || 0,
                output: data.response.usageMetadata.candidatesTokenCount || 0,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: data.response.usageMetadata.totalTokenCount || 0,
                cost: {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  total: 0,
                },
              };
            }

            if (candidate.finishReason) {
              finalMessage.stopReason =
                candidate.finishReason.toLowerCase() === "stop"
                  ? "stop"
                  : "stop";
            }
          } catch {
            // Ignore parse errors on keepalive
          }
        }
      }

      if (textContentIndex !== -1) {
        stream.push({
          type: "text_end",
          contentIndex: textContentIndex,
          content: currentText,
          partial: finalMessage,
        });
      }

      if (thinkingContentIndex !== -1) {
        stream.push({
          type: "thinking_end",
          contentIndex: thinkingContentIndex,
          content: currentThinking,
          partial: finalMessage,
        });
      }

      stream.push({ type: "done", reason: "stop", message: finalMessage });
      stream.end(finalMessage);
    } catch (err) {
      finalMessage.stopReason = "error";
      finalMessage.errorMessage = (err as Error).message;
      stream.push({ type: "error", reason: "error", error: finalMessage });
      stream.end(finalMessage);
    }
  })();

  return stream;
}
