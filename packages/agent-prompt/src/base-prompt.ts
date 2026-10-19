import { buildAgentPrompt } from "./agent-prompt.js";

/**
 * Builds the default baseline system prompt for Cobot.
 */
export function buildBasePrompt(cwd: string): string {
  return buildAgentPrompt({ cwd });
}
