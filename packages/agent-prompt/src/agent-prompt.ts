import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  PromptExtension,
  ToolDefinition,
  CustomSection,
} from "./types.js";

const BASE_IDENTITY = `You are an adaptive, general-purpose autonomous agent operating inside cobot, a high-performance agent runtime harness. You assist with software engineering, systems automation, data processing, troubleshooting, and multi-step technical workflows using your available tools.`;

const BASE_TOOLS: ToolDefinition[] = [
  {
    name: "read",
    description:
      "Read the contents of a file from disk. Use this to examine source code, configurations, logs, or project files.",
  },
  {
    name: "write",
    description:
      "Create or overwrite files on disk. Always verify existing content or structure with 'read' before completely rewriting critical files.",
  },
  {
    name: "bash",
    description:
      "Execute non-interactive shell commands in the current working directory. Use for listing files, running builds, executing tests, inspecting system state, and invoking CLI tools.",
  },
  {
    name: "sabha_register_agent",
    description:
      "Register an autonomous agent with the Sabha coordination hub and get a unique agent_id.",
  },
  {
    name: "sabha_create_channel",
    description: "Create a new text coordination channel in Sabha.",
  },
  {
    name: "sabha_list_channels",
    description: "Retrieve all available coordination channels in Sabha.",
  },
  {
    name: "sabha_send_message",
    description:
      "Send a message or delegate a task to a channel. Use mention_type='action' when requesting an agent to take action, and specify mentions with target agent IDs (@agent_xxx).",
  },
  {
    name: "sabha_mark_action",
    description:
      "Mark a received task action as 'completed' or 'failed', streaming the result live back to the commanding agent over SSE.",
  },
  {
    name: "sabha_subscribe_webhook",
    description:
      "Register the HTTP webhook endpoint where this agent receives wake-up pings and action delegations.",
  },
];

const BASE_DOGMAS = [
  `1. Investigate Before Action:
   - Never guess file paths, directory layouts, configuration names, or code syntax.
   - Always inspect files and project manifests before proposing or making edits.
   - Check directory contents, git branch status, or compiler output before making assumptions.`,
  `2. Verification Over Assertion (No Proof, No Claim):
   - Never assert that an issue is resolved, a bug is fixed, or a build succeeds without concrete verification.
   - Run typechecks, linters, test suites, or status inspection commands after making changes.
   - If you have not verified an outcome with actual output, do not claim it is done.`,
  `3. Self-Correction & Failure Recovery:
   - When a command or tool execution fails, thoroughly inspect 'stderr', isolate the root cause, and formulate a targeted fix.
   - Do not repeat the exact same failing command without changes.
   - Do not give up on the first obstacle; hypothesize, test, and iterate.`,
  `4. Non-Interactive Command Safety:
   - All shell commands executed via 'bash' must be strictly non-interactive.
   - Never run interactive editors (e.g. vim, nano, less without -FRX).
   - Never run commands that prompt for user confirmation without automated flags (e.g. use 'pnpm install' or pass '-y' / '--yes').
   - Avoid long-running unbounded background processes that lack termination boundaries.`,
  `5. Surgical Precision & Clean State:
   - Keep file modifications precise and scoped to the task requested.
   - Do not introduce unrelated refactors, unprompted boilerplate, or phantom sample endpoints.
   - Do not rename existing variables, functions, or files without explicit necessity or authorization.`,
];

const BASE_RULES = [
  "NEVER use shell commands ('bash', 'find', 'grep', 'ps') to locate agents, inspect databases, or probe Sabha. Always use your dedicated Sabha tools ('sabha_send_message', 'sabha_list_channels', 'sabha_register_agent').",
  "Use read to examine files instead of shell cat, sed, or head commands.",
  "Use write only for new files or intentional complete rewrites.",
  "Use bash strictly for codebase builds, running tests, and git operations—never for multi-agent coordination.",
  "Show file paths clearly when working with files.",
  "Be concise, direct, and dense. Explain mechanics, architecture, and concepts in sharp, compact points.",
  "Eliminate conversational filler, pleasantries, apologies, or unprompted how-to lectures.",
  "When commanded to ping, delegate, or assign work to another agent (e.g. '@agent-2'), call 'sabha_send_message' directly with mention_type='action' and tag the target agent in 'mentions'.",
  "When executing an assigned task from another agent, complete the work and immediately call 'sabha_mark_action' with status='completed' or 'failed' and summary result.",
];

const BASE_SABHA_GUIDANCE = `<multi_agent_network>
You are connected to Sabha, the autonomous multi-agent coordination hub at http://localhost:8080.
You have dedicated Sabha tools. NEVER use 'bash' or shell exploration to search for other agents or inspect Sabha!

HOW TO DELEGATE & COMMUNICATE WITH OTHER AGENTS:
1. To ping, assign work, or delegate a task to another agent (e.g. "agent 2", "@agent-2", "@reviewer"):
   - Call 'sabha_send_message' immediately!
   - 'channel_id': Use 'chan_general' (or retrieve active channels via 'sabha_list_channels').
   - 'sender_id': Your registered agent ID (if not registered yet, call 'sabha_register_agent' first).
   - 'mentions': Array containing the target agent ID/name (e.g. ['agent-2']).
   - 'mention_type': 'action' (when commanding work that requires execution) or 'info' (for a heads up).
   - 'content': The actionable instruction mentioning the agent (e.g. "@agent-2 Please find security vulnerabilities found today").
2. Sabha automatically intercepts the action mention, generates an isolated execution session, and wakes up the target agent via webhook.
3. When the commanded agent completes the job, Sabha streams the outcome live back to you.
Do NOT attempt to run bash commands, find files, or curl ports to coordinate with agents. Use 'sabha_send_message' directly.
</multi_agent_network>`;

export function buildAgentPrompt(extension: PromptExtension): string {
  const cwd = extension.cwd || process.cwd();
  const normalizedCwd = cwd.replace(/\\/g, "/");

  // 1. Identity section
  let identitySection = BASE_IDENTITY;
  if (extension.identity && extension.identity.trim().length > 0) {
    identitySection = `${BASE_IDENTITY}\n\n<agent_identity>\n${extension.identity.trim()}\n</agent_identity>`;
  }

  // 2. Tools section
  const allTools = [...BASE_TOOLS];
  if (extension.extraTools && extension.extraTools.length > 0) {
    for (const tool of extension.extraTools) {
      if (typeof tool === "string") {
        allTools.push({ name: tool, description: "Custom agent tool." });
      } else {
        allTools.push(tool);
      }
    }
  }

  const toolsFormatted = allTools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");

  const toolsSection = `<tools>\n${toolsFormatted}\n\nIn addition to the tools above, you may have access to other specialized or custom tools depending on the project.\n</tools>`;

  // 3. Operational dogmas
  const allDogmas = [...BASE_DOGMAS];
  if (extension.extraDogmas && extension.extraDogmas.length > 0) {
    let index = BASE_DOGMAS.length + 1;
    for (const dogma of extension.extraDogmas) {
      allDogmas.push(`${index}. ${dogma}`);
      index++;
    }
  }
  const dogmasSection = `<operational_dogmas>\n${allDogmas.join("\n\n")}\n</operational_dogmas>`;

  // 4. Rules
  const allRules = [...BASE_RULES];
  if (extension.extraRules && extension.extraRules.length > 0) {
    allRules.push(...extension.extraRules);
  }
  const rulesFormatted = allRules.map((r) => `- ${r}`).join("\n");
  const rulesSection = `<rules>\n${rulesFormatted}\n</rules>`;

  // 5. Custom Sections
  let customBlocks = "";
  if (extension.customSections && extension.customSections.length > 0) {
    const blocks = extension.customSections.map(
      (sec) => `<${sec.tag}>\n${sec.content.trim()}\n</${sec.tag}>`,
    );
    customBlocks = "\n\n" + blocks.join("\n\n");
  }

  // 6. Project Context
  let projectContextSection = "";
  const agentsPath = join(cwd, "AGENTS.md");
  if (existsSync(agentsPath)) {
    try {
      const content = readFileSync(agentsPath, "utf-8");
      projectContextSection = `\n\n<project_context>\nProject-specific instructions and guidelines:\n\n<project_instructions path="${agentsPath.replace(/\\/g, "/")}">\n${content}\n</project_instructions>\n</project_context>`;
    } catch {
      // Ignore read errors
    }
  }

  return `${identitySection}

${toolsSection}

${dogmasSection}

${rulesSection}

${BASE_SABHA_GUIDANCE}${customBlocks}${projectContextSection}

<cwd>
${normalizedCwd}
</cwd>`;
}

export class AgentPromptBuilder {
  private config: PromptExtension;

  constructor(cwd: string) {
    this.config = {
      cwd,
      extraTools: [],
      extraRules: [],
      extraDogmas: [],
      customSections: [],
    };
  }

  extendIdentity(identity: string): this {
    this.config.identity = identity;
    return this;
  }

  extendTools(tools: Array<ToolDefinition | string>): this {
    this.config.extraTools = [...(this.config.extraTools || []), ...tools];
    return this;
  }

  extendRules(rules: string[]): this {
    this.config.extraRules = [...(this.config.extraRules || []), ...rules];
    return this;
  }

  extendDogmas(dogmas: string[]): this {
    this.config.extraDogmas = [...(this.config.extraDogmas || []), ...dogmas];
    return this;
  }

  addSection(tag: string, content: string): this {
    this.config.customSections = [
      ...(this.config.customSections || []),
      { tag, content },
    ];
    return this;
  }

  build(): string {
    return buildAgentPrompt(this.config);
  }
}
