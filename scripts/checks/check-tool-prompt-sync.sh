#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "🔍 [Check 7/7] Verifying all @cobot/tools are documented in @cobot/agent-prompt..."

node --experimental-strip-types - << 'EOF'
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const toolsPath = path.join(rootDir, "packages/tools/src/index.ts");
const promptPath = path.join(rootDir, "packages/agent-prompt/src/agent-prompt.ts");

if (!fs.existsSync(toolsPath) || !fs.existsSync(promptPath)) {
  console.error("❌ [Tool-Prompt Sync] Missing packages/tools or packages/agent-prompt source files");
  process.exit(1);
}

const toolsSource = fs.readFileSync(toolsPath, "utf-8");
const promptSource = fs.readFileSync(promptPath, "utf-8");

// Extract tools registered in createBaseTools
const toolNames = [...toolsSource.matchAll(/name:\s*"([^"]+)"/g)].map(m => m[1]);

// Extract tools documented in BASE_TOOLS
const promptTools = [...promptSource.matchAll(/name:\s*"([^"]+)"/g)].map(m => m[1]);

const missing = toolNames.filter(t => !promptTools.includes(t));

if (missing.length > 0) {
  console.error("\n❌ [Tool-Prompt Sync Failure] The following tools exist in @cobot/tools but are MISSING from base agent prompt:");
  for (const tool of missing) {
    console.error(`   - ${tool}`);
  }
  console.error("\n👉 Fix: Document these tools in BASE_TOOLS inside packages/agent-prompt/src/agent-prompt.ts before committing!\n");
  process.exit(1);
}

console.log(`✔ [Prompt-Sync] All ${toolNames.length} tools in @cobot/tools are synchronized with @cobot/agent-prompt.`);
EOF
