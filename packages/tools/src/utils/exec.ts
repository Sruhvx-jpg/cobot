import { exec } from "node:child_process";
import { promisify } from "node:util";

const execPromise = promisify(exec);

export interface ExecOptions {
  cwd: string;
  signal?: AbortSignal;
  maxBuffer?: number;
}

export async function executeCommand(command: string, options: ExecOptions) {
  return execPromise(command, {
    cwd: options.cwd,
    signal: options.signal,
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
  });
}
