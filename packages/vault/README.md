# @cobot/vault

General-purpose, inode-based storage engine with persistent lookup indexing and code-gated encryption.

---

## Architecture

The storage engine implements an inode table architecture over the local filesystem (`~/.cobot/`):

```
~/.cobot/
├── index.json                  # Persistent Master Inode Table (Lookup Index)
│
└── vaults/
    ├── simple/                 # 🔓 Simple Vault (Unencrypted general-purpose storage)
    │   ├── data/               # General-purpose files & blobs
    │   └── sessions/           # Agent session logs (*.jsonl)
    │
    └── code/                   # 🔐 Code Vault (Code/Passcode-gated AES-256-GCM)
        └── secrets/            # Encrypted payloads (*.enc)
```

---

## Core Inode Design

Every resource in the vault is tracked as an **Inode**:

```ts
export interface Inode<TMetadata = Record<string, unknown>> {
  id: string; // Unique identifier / key
  vault: "simple" | "code"; // Storage tier
  path: string; // Path relative to storageRoot
  size: number; // Byte size
  mimeType?: string; // Content MIME type
  metadata: TMetadata; // Arbitrary user/system attributes
  createdAt: number; // Inode creation timestamp
  updatedAt: number; // Last modified timestamp
}
```

The master index (`index.json`) acts as the inode table and provides $O(1)$ lookups without scanning the filesystem.

---

## Features

1. **Simple Vault**:
   - High-throughput general-purpose reads, writes, and appends.
   - Stream reader (`getReadStream(id)`).
   - Atomic writes and directory creation.

2. **Code Vault**:
   - Sensitive data sealed with `AES-256-GCM`.
   - Key derived from a user-supplied `code` via `scrypt`.
   - Payload authentication tags prevent tampering.
   - Without the correct code, the payload on disk cannot be decrypted.

3. **Master Lookup Index**:
   - Tracks all inodes across both tiers.
   - Atomic updates using temporary files and atomic POSIX rename.
   - Automatic self-healing: scans disk directories on boot to register unindexed files.

4. **Session Domain Store**:
   - Turn-by-turn append-only streaming logs for coding agents.
   - Automatic session titling from the first user prompt.

---

## Usage

```ts
import { CobotVault } from "@cobot/vault";

const vault = new CobotVault();
await vault.init();

// 1. General-purpose Simple Vault
await vault.simple.write(
  "my-config",
  { theme: "dark" },
  { mimeType: "application/json" },
);
const config = await vault.simple.read("my-config");

// 2. Code-Protected Vault (Passcode-gated)
await vault.code.write("api-key", "my-secret-passcode", {
  token: "secret_12345",
});
const secret = await vault.code.read("api-key", "my-secret-passcode");

// 3. Fast Inode Lookup
const info = vault.resolve("my-config");
console.log(info?.absolutePath); // /home/user/.cobot/vaults/simple/data/my-config.json
```
