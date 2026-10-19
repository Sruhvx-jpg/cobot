# Cobot Architecture Vision & Future Roadmap

This document captures the systems design, architectural roadmap, and technical vision for the **Cobot** ecosystem, preserving the **verbatim words and brainstormed ideas** directly from the lead architect alongside the technical specifications.

---

## 0. Lead Architect's Raw Vision (Verbatim Notes)

> *"note that the agents will be multipurpose agents not just coding agents"*

### On In-Process Chroma Engine, EmbeddingGemma 2 & Rust Adapter
> *"so yeah just the engine does the job. but yeah i wanne keep it in the package, what do u say?"*
> 
> *"also explcicitly mention that this engine will in future/ is in present understand extension for cobot's usecase, it is not built by sruhvx-jpg bbut a cloned and trimmed for cobot usecase"*
> 
> *"btw if use the an embedding model like embedding gemma 2, we wont really need the embedder of chromadb, right? ... can u remove the embedder than? make a adaptar that bridges the embedding model we would use and with the storage"*
> 
> *"btw cant we have this adapter in rust tho? ... no we dont need tauri ipc, well we prolly make a toool for the agents to actually use this adapte later. btw if am right thi adapter is something that dircetly interacts witht eh engine right?"*

### On Cloud Seeding & Persistent Runner (Instabox)
> *"aight one thing that is remaining is cloud seeding, as i have told u this will be a persistent agent runnig in cloud, so we need to seed evertything to the cloud but we are not doing it right now, as alot of stuff is not finalized, like there are some backlogs"*
> 
> *"but will it be possible on the free instabox vm? 4 vCPUs, 8 GB RAM, and 20 GB of storage. this is the free vm we get btw"*

### On TracerDuty, AgentHouse, Backup & Distributed Subsystems
> *"i hope u account or the other stuff this thing is going to have, the tracer dty the agent house and am thinking og a pager duty and backup system and a distrbuted sys and also a small >=1b model seeder that seeds too various devices"*
> 
> *"alot of it it will be local only as of now but yeah i think the agnt house will be extended to be more than just being a local houe for the agent to talk locally on the machine"*

### On Model Seeder & Child Agents Across Devices
> *"model seeder will just seed a small model it can use to communicate with, thats like creating a small child agent to various devices to coordinate with"*
> 
> *"any ways my motivation to made this seeder isnt noble btw ... its more or less vicious to say"*

### On Go Git Wrapper, Android App & Custom Networking Tunneling
> *"yeah to manage space am thinking og having a distributed backend sys, am also thinking of my a git wrapper for the agent specifically in go like how nantrhopic mde"*
> 
> *"also thinkinng of make a android app too so there will be a use of webhook but anyways the server will still be the same that the desktop and andoirdn app frontned wll use regardless, just need to introduce a secure tunneling in all. am thinking of making a simple networking tunniing here, like no need of hacing clouflare proxy, but yeah lets see, what do u think will happen. at scale? i think the current compute would be not enough"*

### On Actix-Files & Actix-Web Exploration
> *"is there any usecase of actix-files in our project? ... is it not possible to replace the axum to actix? ... well there are other things we are gonne be doing too u remember? maybe somewhere ther i could use it"*

---

## 1. High-Level System Vision

Cobot is evolving from a local coding agent into a **persistent, multipurpose autonomous agent platform** running across heterogeneous devices (headless cloud runners, desktop shells, and mobile edge nodes).

```
                            ┌─────────────────────────────────────────┐
                            │           Cloudflare R2 / S3            │
                            │   (GGUF Model Weights, Cold Backups)    │
                            └────────────────────┬────────────────────┘
                                                 │ Direct Pre-Signed Downloads
                                                 │ (0 Byte VM Bandwidth)
                                                 ▼
┌──────────────────┐    Custom Tunnel    ┌─────────────────────────┐    Custom Tunnel    ┌──────────────────┐
│   Desktop App    │ ──────────────────> │   Central Cloud Hub     │ <────────────────── │   Android App    │
│  (Tauri 2.0 / UI)│ <────────────────── │ (Instabox 4vCPU / 8GB)  │ ──────────────────> │   (Mobile Shell) │
└──────────────────┘                     │                         │                     └──────────────────┘
                                         │ • agent-house (Go)      │
                                         │ • tracer-duty (Go)      │
                                         │ • chroma-engine (Rust)  │
                                         │ • cobot-adapter (Gemma) │
                                         │ • native tunnel gateway │
                                         └───────────┬─────────────┘
                                                     │ Local Child Spawn / RPC
                                                     ▼
                                         ┌─────────────────────────┐
                                         │   Edge Device Swarm     │
                                         │  (Local ≥1B SLM Agents) │
                                         └─────────────────────────┘
```

---

## 2. Core Pillars & Roadmap Components

### A. In-Process Vector Engine & EmbeddingGemma 2 (`packages/chroma-engine`)
* **Status**: Implemented (`@cobot/chroma-engine` & `cobot-adapter`).
* **Design**: Complete elimination of external HTTP/gRPC database daemons and bloated ONNX runtimes (`@chroma-core/default-embed`, `onnxruntime-node`).
* **Embedding Strategy**: Swapped with **EmbeddingGemma 2** (Google's 768-dimensional dense vector model) connected via the in-process `cobot-adapter` crate with SIMD-accelerated distance math (`chroma-distance`).
* **Execution**: Single-digit millisecond retrieval in-memory; directly consumable by agent reasoning loops via `store.search_for_agent()`.

---

### B. Persistent Cloud Hub (Instabox VM Deployment)
* **Target Hardware**: 4 vCPUs, 8 GB RAM, 20 GB Disk (Debian-based Instabox sandbox).
* **Operational Mode**: Created with `--auto-suspend 0` to maintain persistent 24/7 responsiveness.
* **Control Plane Footprint**: 
  - `agent-house` (Go) + `tracer-duty` (Go) + in-process Chroma (Rust) consume **< 500 MB RAM** combined.
  - Leaves ~7.5 GB RAM and ~9 GB disk free for transient tasks and model caching.
* **Cloud Seeding**: Deferred until vector schemas and agent turn loops are frozen. Once ready, local states and HNSW segments will be snapshotted and hydrated on cold start.

---

### C. Model Seeder & Edge Device Swarm ($\ge$1B SLMs)
* **Goal**: Spawn lightweight child agents on edge devices (laptops, Android phones, local servers) to handle decentralized tasks without central compute bottlenecks.
* **Seeder Architecture**:
  - The central hub does **NOT** proxy multi-gigabyte model weights through its own network interface.
  - Instead, it generates **pre-signed download URLs** pointing to Cloudflare R2 / S3, or coordinates P2P content-addressed chunking (HTTP Range requests / `sendfile(2)`).
  - Edge devices pull compact $\ge$1B quantized models (GGUF Q4/Q8) directly, burn their own local CPU/NPU/Metal cores for inference, and report structured turns back to `agent-house`.

---

### D. `agent-house` Multi-Device Switchboard
* **Evolution**: Transitioning from a purely local machine IPC chat house into a **distributed multi-device communication bus**.
* **Capabilities**:
  - Acts as the central broker for agent coordination tokens, turn handoffs, and event broadcasts.
  - Implements an epidemic gossip / heartbeat protocol so edge nodes remain loosely coupled.
  - Zero-latency failure handling: any edge node dropping offline does not block the central turn loop.

---

### E. Unified Frontends: Desktop (Tauri) + Mobile (Android)
* **Single Backend Contract**: Both the desktop app and the upcoming Android app connect to the same central backend API over WebSockets, SSE, and webhooks.
* **No Logic Duplication**: Agent turn loops, prompt composition, tool dispatching, and memory indexing remain strictly on the backend; frontends act as reactive rendering shells.

---

### F. Custom Secure Networking Tunnel (Zero Cloudflare Proxy)
* **Goal**: Seamless connectivity across firewalls, NATs, and mobile carrier networks without relying on third-party SaaS proxy hacks or Cloudflare upload limits.
* **Implementation Strategy**:
  - Lightweight native Go tunnel (mTLS with multiplexed streams via `yamux` or embedded `tsnet`).
  - Edge nodes establish strictly **outbound-only** connections to the central hub on port 443.
  - Hub multiplexes bidirectional RPC/agent streams over established tunnels with zero open incoming ports on edge devices.

---

### G. Go-Native Git Wrapper for Agents
* **Inspiration**: Anthropic / Claude Code agent toolchain.
* **Architecture**: A dedicated, compiled Go binary wrapping the native `git` CLI specifically for Cobot agents.
* **Key Features**:
  - **Streaming Diff Sanitization**: Automatically truncates massive files (lockfiles, minified bundles, binary assets) before handing context to the LLM.
  - **Lock Safety**: Auto-cleans stale `.git/index.lock` handles and enforces strict command timeouts.
  - **Structured JSON Output**: Returns machine-readable parse trees of staged diffs, untracked trees, and commit histories.

---

### H. Specialized Runtimes: Axum vs. Actix Allocation
To avoid framework collisions, workloads are cleanly partitioned:
* **In-Process Engine & Memory (`packages/chroma-engine`)**: Strictly **Axum + Tower + Hyper 1.0 + Tokio** for shared gRPC/Tonic middleware and SIMD vector compute.
* **High-Throughput Distribution Edge (`cobot-seeder`)**: Dedicated microservice leveraging **`actix-web` + `actix-files`** to take advantage of zero-copy kernel **`sendfile(2)`** and thread-isolated per-core Arbiters for high-speed chunked model transfers and massive WebSocket fan-out.
