import { resolve, isAbsolute } from "node:path";

export function resolveSafePath(cwd: string, targetPath: string): string {
  return isAbsolute(targetPath) ? targetPath : resolve(cwd, targetPath);
}
