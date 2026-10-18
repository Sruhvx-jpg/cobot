#!/usr/bin/env bash
set -euo pipefail

echo "🦀 [Check 4/5] Running Cargo typecheck on Tauri desktop native shell..."
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --quiet
echo "✔ [Rust] Native desktop shell compiled cleanly."
