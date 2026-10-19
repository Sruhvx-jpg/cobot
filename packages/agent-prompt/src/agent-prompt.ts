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
  "Use read to examine files instead of shell cat, sed, or head commands.",
  "Use write only for new files or intentional complete rewrites.",
  "Use bash for file discovery, search, build orchestration, testing, and git operations.",
  "Show file paths clearly when working with files.",
  "Be concise, direct, and dense. Explain mechanics, architecture, and concepts in sharp, compact points.",
  "Eliminate conversational filler, pleasantries, apologies, or unprompted how-to lectures.",
];

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

${rulesSection}${customBlocks}${projectContextSection}

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
