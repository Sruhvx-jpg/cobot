import { Type, type Static } from "typebox";
import type { AgentTool } from "@cobot/agent-core";
import { executeRead } from "./sauce/read.js";
import { executeWrite } from "./sauce/write.js";
import { executeBash } from "./sauce/bash.js";
import { executeVectorSearch, executeVectorUpsert } from "./sauce/chroma.js";

export * from "./sauce/read.js";
export * from "./sauce/write.js";
export * from "./sauce/bash.js";
export * from "./sauce/chroma.js";
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

export const VectorSearchParamsSchema = Type.Object({
  query: Type.String({
    description:
      "Search query string to semantically match against vector memory",
  }),
  top_k: Type.Optional(
    Type.Integer({
      description: "Number of top results to return (default: 5, max: 100)",
    }),
  ),
  min_score: Type.Optional(
    Type.Number({
      description: "Optional minimum similarity score threshold (0.0 to 1.0)",
    }),
  ),
});

export const VectorUpsertParamsSchema = Type.Object({
  id: Type.String({ description: "Unique document identifier" }),
  text: Type.String({
    description: "Raw text content to embed and store in vector memory",
  }),
  metadata: Type.Optional(
    Type.String({
      description: "Optional metadata tags or JSON string",
    }),
  ),
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

  const vectorSearchTool: AgentTool<typeof VectorSearchParamsSchema> = {
    name: "vector_search",
    label: "Vector Memory Search",
    description:
      "Search long-term semantic vector memory using ChromaDB microservice over HTTP QUERY.",
    parameters: VectorSearchParamsSchema,
    execute: async (
      _toolCallId,
      params: Static<typeof VectorSearchParamsSchema>,
    ) => {
      return executeVectorSearch(params.query, params.top_k, params.min_score);
    },
  };

  const vectorUpsertTool: AgentTool<typeof VectorUpsertParamsSchema> = {
    name: "vector_upsert",
    label: "Vector Memory Upsert",
    description:
      "Store or update a document in long-term semantic vector memory via ChromaDB microservice over HTTP PUT.",
    parameters: VectorUpsertParamsSchema,
    execute: async (
      _toolCallId,
      params: Static<typeof VectorUpsertParamsSchema>,
    ) => {
      return executeVectorUpsert(params.id, params.text, params.metadata);
    },
  };

  return [readTool, writeTool, bashTool, vectorSearchTool, vectorUpsertTool];
}
