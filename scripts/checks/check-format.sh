#!/usr/bin/env bash
set -euo pipefail

echo "🎨 [Check 2/5] Running lint-staged formatting check..."
pnpm exec lint-staged
echo "✔ [Format] Staged files formatted cleanly."
