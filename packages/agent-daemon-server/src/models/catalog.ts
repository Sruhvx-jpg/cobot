import type { Model } from "@earendil-works/pi-ai";
import { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";
import { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";
import { getStoredAuth } from "../auth/antigravity.js";

const USER_AGENT =
  "antigravity/cli/1.4.0 (aidev_client; os_type=linux; arch=amd64; cl=982146307; auth_method=consumer)";

export interface ModelDescriptor {
  id: string;
  provider: string;
  label: string;
}

export async function getAvailableModels(): Promise<ModelDescriptor[]> {
  const auth = await getStoredAuth();
  const models: ModelDescriptor[] = [];

  // Live dynamic discovery from Google Antigravity Code Assist API
  if (auth && auth.access_token) {
    try {
      const res = await fetch(
        "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${auth.access_token}`,
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
          },
          body: JSON.stringify({
            project: auth.projectId || "aicode-consumers",
          }),
        },
      );

      if (res.ok) {
        const data = await res.json();
        const rawModels = data.models || {};
        for (const [key, val] of Object.entries(rawModels)) {
          // Filter internal telemetry, tab completions, and disabled models
          if (
            key.startsWith("tab_") ||
            key.startsWith("chat_") ||
            key.includes("disabled") ||
            key.includes("image")
          ) {
            continue;
          }
          const displayName = (val as any)?.displayName || key;
          models.push({
            id: key,
            provider: "antigravity",
            label: `${displayName}`,
          });
        }
      }
    } catch (err) {
      console.error("[Models] Failed to fetch live AGY catalog:", err);
    }
  }

  // Anthropic API Key in environment
  if (process.env.ANTHROPIC_API_KEY) {
    models.push(
      {
        id: "claude-sonnet-4-5",
        provider: "anthropic",
        label: "Claude Sonnet 4.5",
      },
      {
        id: "claude-haiku-4-5",
        provider: "anthropic",
        label: "Claude Haiku 4.5",
      },
    );
  }

  // OpenAI API Key in environment
  if (process.env.OPENAI_API_KEY) {
    models.push(
      { id: "gpt-4o", provider: "openai", label: "GPT-4o" },
      { id: "gpt-4o-mini", provider: "openai", label: "GPT-4o Mini" },
    );
  }

  return models;
}

export async function resolveModel(
  requestedProvider?: string,
  requestedModelId?: string,
): Promise<{
  model: Model<any>;
  isAntigravity: boolean;
  apiKey?: string;
  headers?: Record<string, string>;
}> {
  const auth = await getStoredAuth();

  // If user selected Antigravity or is signed into Antigravity
  if (
    requestedProvider === "antigravity" ||
    (!requestedProvider && auth?.access_token)
  ) {
    if (!auth || !auth.access_token) {
      throw new Error(
        "Session expired or not found. Please click 'LOGIN' to authenticate.",
      );
    }

    const modelId = requestedModelId || "gemini-2.5-flash";

    const model: Model<any> = {
      id: modelId,
      name: modelId,
      provider: "antigravity",
      api: "antigravity-api" as any,
      baseUrl: "https://daily-cloudcode-pa.googleapis.com",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0.1 },
      contextWindow: 1048576,
      maxTokens: 65536,
    };

    return {
      model,
      isAntigravity: true,
    };
  }

  // Anthropic
  if (requestedProvider === "anthropic" || process.env.ANTHROPIC_API_KEY) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "Missing ANTHROPIC_API_KEY in environment, and AGY is not signed in.",
      );
    }
    const modelId = requestedModelId || "claude-sonnet-4-5";
    const anthropicModel =
      (ANTHROPIC_MODELS as any)[modelId] ||
      (ANTHROPIC_MODELS as any)["claude-sonnet-4-5"];

    if (!anthropicModel) {
      throw new Error(`Anthropic model '${modelId}' not found in registry.`);
    }

    return {
      model: anthropicModel,
      isAntigravity: false,
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }

  // OpenAI
  if (requestedProvider === "openai" || process.env.OPENAI_API_KEY) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "Missing OPENAI_API_KEY in environment, and AGY is not signed in.",
      );
    }
    const modelId = requestedModelId || "gpt-4o";
    const openaiModel =
      (OPENAI_MODELS as any)[modelId] || (OPENAI_MODELS as any)["gpt-4o"];

    if (!openaiModel) {
      throw new Error(`OpenAI model '${modelId}' not found in registry.`);
    }

    return {
      model: openaiModel,
      isAntigravity: false,
      apiKey: process.env.OPENAI_API_KEY,
    };
  }

  throw new Error(
    "No authenticated model available. Please click 'LOGIN' in the top right to authenticate.",
  );
}
