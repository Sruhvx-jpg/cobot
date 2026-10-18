import { executeCommand } from "../utils/exec.js";

export async function executeBash(
  cwd: string,
  command: string,
  signal?: AbortSignal,
) {
  try {
    const { stdout, stderr } = await executeCommand(command, { cwd, signal });
    const output = stdout || stderr || "(command completed with no output)";
    return {
      content: [{ type: "text" as const, text: output }],
      details: { stdout, stderr },
      isError: false,
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Command failed: ${(err as Error).message}`,
        },
      ],
      details: undefined,
      isError: true,
    };
  }
}
