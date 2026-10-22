import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface ChromaRuntimeConfig {
  service: string;
  host: string;
  port: number;
  base_url: string;
  pid: number;
}

/// Discovers the active ChromaDB microservice URL from ~/.cobot/runtime/chromadb.json
export async function getChromaBaseUrl(): Promise<string> {
  const runtimePath = join(homedir(), ".cobot", "runtime", "chromadb.json");
  try {
    const raw = await readFile(runtimePath, "utf-8");
    const config: ChromaRuntimeConfig = JSON.parse(raw);
    if (!config.base_url) {
      throw new Error(
        "Missing 'base_url' field in chromadb.json runtime config",
      );
    }
    return config.base_url;
  } catch (err) {
    throw new Error(
      `ChromaDB microservice is not running or unreachable. Could not read runtime discovery file at ${runtimePath}: ${(err as Error).message}`,
    );
  }
}

/// Internal execution sauce for vector similarity search via RFC HTTP QUERY
export async function executeVectorSearch(
  query: string,
  topK = 5,
  minScore?: number,
) {
  try {
    const baseUrl = await getChromaBaseUrl();
    const endpoint = `${baseUrl}/documents/search`;

    const res = await fetch(endpoint, {
      method: "QUERY",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        top_k: topK,
        min_score: minScore,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        content: [
          {
            type: "text" as const,
            text: `Chroma search failed [HTTP ${res.status}]: ${errText}`,
          },
        ],
        details: { status: res.status },
        isError: true,
      };
    }

    const matches = (await res.json()) as Array<{
      id: string;
      text: string;
      distance: number;
      score: number;
      metadata?: Record<string, any>;
    }>;

    if (!matches || matches.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No matching documents found in vector storage for query: "${query}"`,
          },
        ],
        details: { matchCount: 0 },
        isError: false,
      };
    }

    let formatted = `Found ${matches.length} semantic matches for: "${query}"\n\n`;
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const meta = m.metadata
        ? ` (metadata: ${JSON.stringify(m.metadata)})`
        : "";
      formatted += `[${i + 1}] (Score: ${(m.score * 100).toFixed(1)}%, ID: ${m.id})${meta}\n${m.text.trim()}\n\n`;
    }

    return {
      content: [{ type: "text" as const, text: formatted.trim() }],
      details: { matchCount: matches.length, matches },
      isError: false,
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Vector search execution error: ${(err as Error).message}`,
        },
      ],
      details: undefined,
      isError: true,
    };
  }
}

/// Internal execution sauce for document upsert via HTTP PUT
export async function executeVectorUpsert(
  id: string,
  text: string,
  metadata?: Record<string, any>,
) {
  try {
    const baseUrl = await getChromaBaseUrl();
    const endpoint = `${baseUrl}/documents/${encodeURIComponent(id)}`;

    const res = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        metadata: metadata || null,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        content: [
          {
            type: "text" as const,
            text: `Chroma document upsert failed [HTTP ${res.status}]: ${errText}`,
          },
        ],
        details: { status: res.status },
        isError: true,
      };
    }

    const json = await res.json();
    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully indexed document into vector storage (ID: ${id})`,
        },
      ],
      details: json,
      isError: false,
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Vector upsert execution error: ${(err as Error).message}`,
        },
      ],
      details: undefined,
      isError: true,
    };
  }
}
