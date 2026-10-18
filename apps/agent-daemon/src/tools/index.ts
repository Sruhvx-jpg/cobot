import { Type, type Static } from "typebox";
import type { AgentTool } from "@cobot/agent-core";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const ReadParamsSchema = Type.Object({
  path: Type.String({ description: "Relative or absolute path to the file" }),
});

const WriteParamsSchema = Type.Object({
  path: Type.String({ description: "Relative or absolute path to the file" }),
  content: Type.String({ description: "Full content to write" }),
});

const BashParamsSchema = Type.Object({
  command: Type.String({ description: "Shell command to run" }),
});

export function createBaseTools(cwd: string): AgentTool[] {
  const resolveTarget = (p: string) => (isAbsolute(p) ? p : resolve(cwd, p));

  const readTool: AgentTool<typeof ReadParamsSchema> = {
    name: "read",
    label: "Read File",
    description: "Read the contents of a text file from disk.",
    parameters: ReadParamsSchema,
    execute: async (_toolCallId, params: Static<typeof ReadParamsSchema>) => {
      try {
        const fullPath = resolveTarget(params.path);
        const content = await readFile(fullPath, "utf-8");
        return {
          content: [{ type: "text", text: content }],
          details: { path: fullPath, size: content.length },
          isError: false,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error reading file: ${(err as Error).message}`,
            },
          ],
          details: undefined,
          isError: true,
        };
      }
    },
  };

  const writeTool: AgentTool<typeof WriteParamsSchema> = {
    name: "write",
    label: "Write File",
    description: "Write content to a file on disk (creates or overwrites).",
    parameters: WriteParamsSchema,
    execute: async (_toolCallId, params: Static<typeof WriteParamsSchema>) => {
      try {
        const fullPath = resolveTarget(params.path);
        await writeFile(fullPath, params.content, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: `Successfully wrote ${params.content.length} bytes to ${params.path}`,
            },
          ],
          details: { path: fullPath },
          isError: false,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error writing file: ${(err as Error).message}`,
            },
          ],
          details: undefined,
          isError: true,
        };
      }
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
      try {
        const { stdout, stderr } = await execAsync(params.command, {
          cwd,
          signal,
          maxBuffer: 10 * 1024 * 1024,
        });
        const output = stdout || stderr || "(command completed with no output)";
        return {
          content: [{ type: "text", text: output }],
          details: { stdout, stderr },
          isError: false,
        };
      } catch (err) {
        return {
          content: [
            { type: "text", text: `Command failed: ${(err as Error).message}` },
          ],
          details: undefined,
          isError: true,
        };
      }
    },
  };

  return [readTool, writeTool, bashTool];
}
