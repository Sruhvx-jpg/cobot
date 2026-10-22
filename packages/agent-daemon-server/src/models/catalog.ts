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
  variants?: Record<string, string>; // e.g. low -> "gemini-3.8-flash-low"
}

// In-memory model variant registry mapping base clean models to tiered IDs
const modelVariantMap = new Map<string, Record<string, string>>();

export async function getAvailableModels(): Promise<ModelDescriptor[]> {
  const auth = await getStoredAuth();
  const models: ModelDescriptor[] = [];
  const groupedAntigravity = new Map<
    string,
    { label: string; variants: Record<string, string>; defaultId: string }
  >();

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
          // Filter internal telemetry, tab completions, disabled, and deprecated models
          if (
            key.startsWith("tab_") ||
            key.startsWith("chat_") ||
            key.includes("disabled") ||
            key.includes("image") ||
            key.includes("3.5-flash") ||
            key.includes("3-flash-agent")
          ) {
            continue;
          }
          const rawDisplayName = ((val as any)?.displayName || key) as string;

          // Detect tiered thinking level from key or label
          let tier = "medium";
          if (key.includes("extra-low")) tier = "minimal";
          else if (key.includes("low")) tier = "low";
          else if (key.includes("high")) tier = "high";
          else if (key.includes("medium")) tier = "medium";

          // Clean display name: strip (Low), (Medium), (High), (Thinking), etc.
          const cleanLabel = rawDisplayName
            .replace(/\s*\((Low|Medium|High|Extra Low|Thinking|tiered)\)/gi, "")
            .trim();

          // Derive canonical base model ID
          const baseId = key
            .replace(/-(low|medium|high|extra-low|thinking|tiered)$/i, "")
            .trim();

          if (!groupedAntigravity.has(cleanLabel)) {
            groupedAntigravity.set(cleanLabel, {
              label: cleanLabel,
              variants: {},
              defaultId: key,
            });
          }

          const group = groupedAntigravity.get(cleanLabel)!;
          group.variants[tier] = key;
          // Prefer medium or non-tiered as default
          if (tier === "medium" || !key.includes("-low")) {
            group.defaultId = key;
          }
        }

        // Sort so Gemini 3.8 Flash and Claude Sonnet appear at the top
        const sortedGroups = Array.from(groupedAntigravity.entries()).sort(
          ([a], [b]) => {
            if (a.includes("3.8 Flash")) return -1;
            if (b.includes("3.8 Flash")) return 1;
            if (a.includes("Sonnet")) return -1;
            if (b.includes("Sonnet")) return 1;
            return a.localeCompare(b);
          },
        );

        for (const [cleanLabel, group] of sortedGroups) {
          modelVariantMap.set(group.defaultId, group.variants);
          modelVariantMap.set(cleanLabel.toLowerCase(), group.variants);

          models.push({
            id: group.defaultId,
            provider: "antigravity",
            label: cleanLabel,
            variants: group.variants,
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
  requestedThinkingLevel?: string,
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

    let modelId = requestedModelId || "gemini-2.5-flash";

    // If model has thinking level variants, map to exact tiered model ID
    const thinking = (requestedThinkingLevel || "medium").toLowerCase();
    const variants =
      modelVariantMap.get(modelId) ||
      modelVariantMap.get(
        modelId
          .replace(/-(low|medium|high|extra-low|thinking)$/i, "")
          .toLowerCase(),
      );

    if (variants) {
      if (thinking === "high" && variants.high) {
        modelId = variants.high;
      } else if (thinking === "low" && variants.low) {
        modelId = variants.low;
      } else if (thinking === "minimal" && (variants.minimal || variants.low)) {
        modelId = variants.minimal || variants.low;
      } else if (variants.medium) {
        modelId = variants.medium;
      }
    }

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
    "No supported model provider found. Please sign in with Google or set ANTHROPIC_API_KEY / OPENAI_API_KEY.",
  );
}
