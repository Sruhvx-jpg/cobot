import { Type, type Static } from "typebox";
import type { AgentTool } from "@cobot/agent-core";
import { executeRead } from "./sauce/read.js";
import { executeWrite } from "./sauce/write.js";
import { executeBash } from "./sauce/bash.js";

export * from "./sauce/read.js";
export * from "./sauce/write.js";
export * from "./sauce/bash.js";
export * from "./utils/path.js";
export * from "./utils/exec.js";

export const ReadParamsSchema = Type.Object({
  path: Type.String({ description: "Relative or absolute path to the file" }),
});

export const WriteParamsSchema = Type.Object({
  path: Type.String({ description: "Relative or absolute path to the file" }),
  content: Type.String({ description: "Full content to write" }),
});

export const BashParamsSchema = Type.Object({
  command: Type.String({ description: "Shell command to run" }),
});

export function createBaseTools(cwd: string): AgentTool[] {
  const readTool: AgentTool<typeof ReadParamsSchema> = {
    name: "read",
    label: "Read File",
    description: "Read the contents of a text file from disk.",
    parameters: ReadParamsSchema,
    execute: async (_toolCallId, params: Static<typeof ReadParamsSchema>) => {
      return executeRead(cwd, params.path);
    },
  };

  const writeTool: AgentTool<typeof WriteParamsSchema> = {
    name: "write",
    label: "Write File",
    description: "Create or overwrite a file on disk.",
    parameters: WriteParamsSchema,
    execute: async (_toolCallId, params: Static<typeof WriteParamsSchema>) => {
      return executeWrite(cwd, params.path, params.content);
    },
  };

  const bashTool: AgentTool<typeof BashParamsSchema> = {
    name: "bash",
    label: "Execute Bash",
    description:
      "Execute a shell command inside the current working directory.",
    parameters: BashParamsSchema,
    execute: async (
      _toolCallId,
      params: Static<typeof BashParamsSchema>,
      signal,
    ) => {
      return executeBash(cwd, params.command, signal);
    },
  };

  return [readTool, writeTool, bashTool];
}
