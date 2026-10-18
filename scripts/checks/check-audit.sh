#!/usr/bin/env bash
set -euo pipefail

echo "🛡️  [Check 5/5] Auditing package dependencies for critical CVEs..."

# Hard block on critical severity vulnerabilities
if ! pnpm audit --audit-level=critical; then
  echo "❌ [Audit] Critical security vulnerability detected in dependencies. Run 'pnpm audit' to inspect."
  exit 1
fi

echo "✔ [Audit] Zero critical security vulnerabilities found in dependencies."
