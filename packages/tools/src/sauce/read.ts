import { readFile } from "node:fs/promises";
import { resolveSafePath } from "../utils/path.js";

export async function executeRead(cwd: string, targetPath: string) {
  try {
    const fullPath = resolveSafePath(cwd, targetPath);
    const text = await readFile(fullPath, "utf-8");
    return {
      content: [{ type: "text" as const, text }],
      details: { path: fullPath, size: text.length },
      isError: false,
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error reading file: ${(err as Error).message}`,
        },
      ],
      details: undefined,
      isError: true,
    };
  }
}
