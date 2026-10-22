import type { Response } from "express";

/**
 * AG-UI (Agent-User Interaction Protocol) streaming transport adapter.
 * Standardizes event emission for CopilotKit, assistant-ui, and modern frontend chat surfaces.
 */
export class AGUITransport {
  private readonly runId = `run_${Date.now()}`;
  private readonly messageId = `msg_${Date.now()}`;

  constructor(private readonly res: Response) {
    this.res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    });
    this.res.flushHeaders?.();
  }

  private emit(type: string, payload: Record<string, unknown> = {}): void {
    const event = {
      type,
      runId: this.runId,
      timestamp: Date.now(),
      ...payload,
    };
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  startRun(): void {
    this.emit("RUN_STARTED");
    this.emit("TEXT_MESSAGE_START", {
      messageId: this.messageId,
      role: "assistant",
    });
  }

  sendTextDelta(delta: string): void {
    this.emit("TEXT_MESSAGE_CONTENT", { messageId: this.messageId, delta });
  }

  sendReasoningDelta(delta: string): void {
    this.emit("REASONING_MESSAGE_CONTENT", {
      messageId: this.messageId,
      delta,
    });
  }

  sendToolStart(toolCallId: string, toolName: string, args: unknown): void {
    this.emit("TOOL_CALL_START", {
      toolCallId,
      toolName,
      args: typeof args === "string" ? args : JSON.stringify(args),
    });
  }

  sendToolEnd(
    toolCallId: string,
    toolName: string,
    isError: boolean,
    durationMs?: number,
  ): void {
    this.emit("TOOL_CALL_RESULT", {
      toolCallId,
      toolName,
      isError,
      durationMs,
    });
  }

  finishRun(error?: string): void {
    if (error) {
      this.emit("RUN_ERROR", { message: error });
    } else {
      this.emit("TEXT_MESSAGE_END", { messageId: this.messageId });
      this.emit("RUN_FINISHED");
    }
    this.res.end();
  }
}
