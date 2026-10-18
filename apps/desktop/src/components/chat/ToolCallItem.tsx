import React from "react";
import { Terminal, FileCode, Wrench, Check, AlertCircle } from "lucide-react";
import type { ToolCall } from "../../types/chat.js";
import { LoadingDots } from "../feedback/LoadingDots.js";

interface ToolCallItemProps {
  tool: ToolCall;
}

function getToolIcon(name: string) {
  if (name === "bash") return <Terminal size={13} />;
  if (name === "read" || name === "write" || name === "edit")
    return <FileCode size={13} />;
  return <Wrench size={13} />;
}

export const ToolCallItem: React.FC<ToolCallItemProps> = ({ tool }) => {
  return (
    <div className="border border-[var(--border)] smooth-corners-sm bg-[var(--bg-card)] p-2.5 my-1.5 font-mono text-xs max-w-2xl">
      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        <div className="flex items-center gap-1.5 font-semibold text-[var(--text-main)]">
          {getToolIcon(tool.name)}
          <span className="uppercase">{tool.name}</span>
        </div>
        <div>
          {tool.status === "running" ? (
            <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
              <span>RUNNING</span>
              <LoadingDots />
            </span>
          ) : tool.isError ? (
            <span className="inline-flex items-center gap-1 text-red-400">
              <AlertCircle size={12} />
              <span>FAILED</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
              <Check size={12} />
              <span>{tool.durationMs ? `${tool.durationMs}ms` : "DONE"}</span>
            </span>
          )}
        </div>
      </div>
      {tool.args && (
        <pre className="mt-2 text-[11px] text-[var(--text-muted)] bg-[var(--bg-main)] p-2 smooth-corners-sm overflow-x-auto whitespace-pre-wrap break-all border border-[var(--border)]">
          {tool.args}
        </pre>
      )}
    </div>
  );
};
