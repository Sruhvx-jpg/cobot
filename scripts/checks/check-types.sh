#!/usr/bin/env bash
set -euo pipefail

echo "🧠 [Check 3/5] Running Turborepo check-types across monorepo..."
pnpm exec turbo run check-types
echo "✔ [Types] All packages passed TypeScript typechecks."
