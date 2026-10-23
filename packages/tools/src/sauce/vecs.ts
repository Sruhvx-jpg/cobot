import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface VecSRuntimeConfig {
  service: string;
  host: string;
  port: number;
  base_url: string;
  pid: number;
}

/// Discovers the active VecS microservice URL from ~/.cobot/runtime/vecs.json
export async function getVecSBaseUrl(): Promise<string> {
  const runtimePath = join(homedir(), ".cobot", "runtime", "vecs.json");
  try {
    const raw = await readFile(runtimePath, "utf-8");
    const config: VecSRuntimeConfig = JSON.parse(raw);
    if (!config.base_url) {
      throw new Error("Missing 'base_url' field in vecs.json runtime config");
    }
    return config.base_url;
  } catch (err) {
    throw new Error(
      `VecS vector microservice is not running or unreachable. Could not read runtime discovery file at ${runtimePath}: ${(err as Error).message}`,
    );
  }
}

/// Internal execution sauce for vector similarity search via HTTP QUERY
export async function executeVectorSearch(
  query: string,
  topK = 5,
  minScore?: number,
  docName?: string,
) {
  try {
    const baseUrl = await getVecSBaseUrl();
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
        doc_name: docName,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        content: [
          {
            type: "text" as const,
            text: `VecS search failed [HTTP ${res.status}]: ${errText}`,
          },
        ],
        details: { status: res.status },
        isError: true,
      };
    }

    const matches = (await res.json()) as Array<{
      id: string;
      doc_name?: string;
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
      const title = m.doc_name ? ` (${m.doc_name})` : "";
      const meta = m.metadata
        ? ` [metadata: ${JSON.stringify(m.metadata)}]`
        : "";
      formatted += `[${i + 1}] ID: ${m.id}${title} (Score: ${(m.score * 100).toFixed(1)}%)${meta}\n${m.text.trim()}\n\n`;
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
  metadata?: Record<string, any> | string,
  docName?: string,
) {
  try {
    const baseUrl = await getVecSBaseUrl();
    const endpoint = `${baseUrl}/documents/${encodeURIComponent(id)}`;

    let parsedMetadata: any = metadata;
    if (typeof metadata === "string") {
      try {
        parsedMetadata = JSON.parse(metadata);
      } catch {
        parsedMetadata = { tags: metadata };
      }
    }

    const res = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        doc_name: docName,
        metadata: parsedMetadata || null,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        content: [
          {
            type: "text" as const,
            text: `VecS upsert failed [HTTP ${res.status}]: ${errText}`,
          },
        ],
        details: { status: res.status },
        isError: true,
      };
    }

    const result = (await res.json()) as { id: string };
    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully ingested vector document '${result.id}' into VecS memory.`,
        },
      ],
      details: result,
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
