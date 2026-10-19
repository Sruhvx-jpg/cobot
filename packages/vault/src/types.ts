export type VaultType = "simple" | "code";

/**
 * Inode represents a tracked file/object in the vault storage engine.
 * Analogous to a filesystem inode pointing to physical disk blocks.
 */
export interface Inode<
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string; // Unique inode identifier / key
  vault: VaultType; // "simple" (unencrypted) or "code" (code-protected)
  path: string; // Relative storage path from storageRoot
  size: number; // File size in bytes
  mimeType?: string; // Content MIME type (e.g. application/json, text/plain)
  metadata: TMetadata; // Arbitrary general-purpose user/system attributes
  createdAt: number; // Inode creation timestamp
  updatedAt: number; // Last modified timestamp
}

/**
 * Persistent Master Inode Table stored at ~/.cobot/index.json
 */
export interface InodeTable {
  version: number;
  storageRoot: string;
  inodes: Record<string, Inode>;
}

export interface InodeWriteOptions<
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  vault?: VaultType;
  subDir?: string; // e.g. "sessions", "configs", "artifacts"
  mimeType?: string;
  metadata?: TMetadata;
}

export interface InodeAppendOptions<
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  subDir?: string;
  mimeType?: string;
  metadata?: Partial<TMetadata>;
}

export interface EncryptedPayload {
  version: number;
  algorithm: "aes-256-gcm";
  kdf: "scrypt";
  salt: string; // hex
  iv: string; // hex
  tag: string; // hex
  ciphertext: string; // hex
}

export interface AgentManifest {
  id: string;
  name: string;
  description?: string;
  identity?: string;
  extraTools?: Array<{ name: string; description: string } | string>;
  extraRules?: string[];
  extraDogmas?: string[];
  customSections?: Array<{ tag: string; content: string }>;
  createdAt?: number;
  updatedAt?: number;
}

export interface SessionMetadata {
  agentId: string;
  title: string;
  messageCount: number;
  cwd?: string;
  model?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface SessionHeader {
  id: string;
  agentId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  path: string;
  cwd?: string;
  model?: string;
  provider?: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  tools?: Array<{
    id: string;
    name: string;
    args?: string;
    result?: string;
    isError?: boolean;
    durationMs?: number;
    status?: "running" | "completed" | "error";
  }>;
  timestamp: number;
}

export interface VaultConfig {
  storageRoot?: string; // Defaults to COBOT_HOME or ~/.cobot
}
