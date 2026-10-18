import { writeFile } from "node:fs/promises";
import { resolveSafePath } from "../utils/path.js";

export async function executeWrite(
  cwd: string,
  targetPath: string,
  content: string,
) {
  try {
    const fullPath = resolveSafePath(cwd, targetPath);
    await writeFile(fullPath, content, "utf-8");
    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully wrote ${content.length} bytes to ${targetPath}`,
        },
      ],
      details: { path: fullPath },
      isError: false,
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error writing file: ${(err as Error).message}`,
        },
      ],
      details: undefined,
      isError: true,
    };
  }
}
