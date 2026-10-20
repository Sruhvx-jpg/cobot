# @cobot/vault

Minimal, crash-resistant, persistent text blob storage engine for Cobot.

> **Attribution Disclaimer:**
> Vendored and trimmed from [`unstorage@0.0.1`](https://github.com/unjsio/unstorage) by Pooya Parsa ([@pi0](https://github.com/pi0) / UnJS).
> **NOT** created from scratch by Sruhvx-jpg.

---

## Architecture

The storage engine provides a minimal in-process text blob store with dual crash-resistant namespaces:

```
~/.cobot/vault/blobs/
├── public/                 # 🔓 Public Blobs (Free access, unauthenticated)
└── auth/                   # 🔐 Auth Blobs (Gated by Backend bridge / Agent Key)
```

---

## Features

1. **Trimmed `unstorage v0.0.1` Core**:
   - Zero-dependency in-process key-value/blob storage abstraction.
   - Key normalization (`foo:bar` ➔ `foo/bar`).
   - Pluggable mounts (`mount("public", fsDriver(...))`, `mount("auth", fsDriver(...))`).

2. **Crash Resistant Writes**:
   - Every write drops to a PID-stamped temporary file (`.tmp.<pid>.<time>`) and completes via an atomic filesystem swap (`rename`).
   - If the process or host crashes mid-write, zero half-written or corrupt blobs remain on disk.

3. **Dual Physical Namespaces**:
   - `public:*` keys are physically stored under `<baseDir>/public/`.
   - `auth:*` keys are physically stored under `<baseDir>/auth/`.

---

## Usage

```ts
import { CobotVault, createVault } from "@cobot/vault";

// 1. Initialize Vault (spawns with default or configurable path)
const vault = new CobotVault({
  baseDir: "~/.cobot/vault/blobs",
});

// 2. Store Free Access Text Blob
await vault.setItem("public:welcome-banner", "Welcome to Cobot!");
const banner = await vault.getItem("public:welcome-banner");

// 3. Store Auth-Gated Text Blob
await vault.setItem("auth:agent-prompt-secret", "System directive prompt...");
const secret = await vault.getItem("auth:agent-prompt-secret");

// 4. List keys in a namespace
const publicKeys = await vault.getKeys("public");
console.log(publicKeys); // ["public:welcome-banner"]

// 5. Delete blob
await vault.removeItem("public:welcome-banner");
```

---

## Known Issues & Security Considerations

### ⚠️ Shared-UID Process Boundary (Agent with `bash` Access)

* **Threat**: If an autonomous agent has access to a `bash` tool running under the same host operating system user (`UID`) as the Backend/Vault, application-level checks and environment variables cannot stop direct disk reads.
* **Mechanism**:
  1. Any process running under the same Linux `UID` can inspect sibling processes via `/proc/<pid>/environ` and `/proc/<pid>/cmdline`, exposing any runtime secrets or keys.
  2. The agent can bypass the Backend gateway entirely and execute `cat ~/.cobot/vault/blobs/auth/...` directly off the filesystem.
* **Status**: **Acknowledged Known Issue** (Deferred for future implementation).
* **Planned Mitigation**:
  1. **OS User Separation**: Run the Backend/Vault daemon under a dedicated unprivileged system user (e.g. `_cobot` / UID 1001) with `chmod 0700` directory permissions and a private Unix Domain Socket (`chmod 0600`).
  2. Under this model, the Linux kernel enforces `EACCES (Permission Denied)` on both `/proc` inspection and raw filesystem access by the native host agent.

### ⚠️ Additional Unaddressed Agent-Read Security Issues

* **Open / Deferred Vectors**: In addition to the shared-UID process boundary above, there are further agent-read-related security issues and threat vectors that were noted during design discussions but are currently unaddressed here (to be recalled, thoroughly cataloged, and tackled in upcoming security hardening rounds).

### ⚠️ Agent Access Control & Capability Dilemma (Architectural Note)

* **Design Context & Open Challenge**:
  > *"So far a lot of problems have come to mind, mainly related to agent access control and beyond. These vectors are acknowledged as open design challenges that exceed a simple in-process blob store and require a collaborative, multi-layer systems security architecture."*
* **The Core Paradox**: Autonomous agents require native access to host toolchains (`bash`, compilers, language servers, filesystems) to be effective engineers. Restricting access purely at the application layer is fragile against a shell tool, yet heavy-handed jailing destroys developer ergonomics.
* **Way Forward**: Full agent access control cannot be solved inside a single package or by one developer in a silo. It is an industry-wide open problem requiring defense-in-depth: kernel UID separation, capability-based broker tokens, and progressive permission escalation. This will be architected step-by-step in dedicated security milestones.




