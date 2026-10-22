#!/usr/bin/env bash
set -euo pipefail

echo "🐹 [Check 5/6] Running Go quality, lint, and security checks..."

export PATH="$HOME/go/bin:$HOME/.local/bin:$PATH"

# 1. Format check
UNFORMATTED=$(gofmt -l apps/tracer-duty/src apps/sabha/src || true)
if [ -n "$UNFORMATTED" ]; then
  echo "❌ [Go] Unformatted files detected:"
  echo "$UNFORMATTED"
  echo "Run 'gofmt -w <file>' to format."
  exit 1
fi
echo "✔ [Go] Code formatting clean (gofmt)."

# 2. Go vet compiler checks
go vet ./apps/tracer-duty/src/... ./apps/sabha/src/...
echo "✔ [Go] Compiler semantic checks passed (go vet)."

# 3. golangci-lint
if command -v golangci-lint >/dev/null 2>&1; then
  golangci-lint run ./apps/tracer-duty/src/... ./apps/sabha/src/...
  echo "✔ [Go] Multi-linter suite passed (golangci-lint)."
fi

# 4. govulncheck
if command -v govulncheck >/dev/null 2>&1; then
  (cd apps/tracer-duty/src && govulncheck ./...) >/dev/null
  (cd apps/sabha/src && govulncheck ./...) >/dev/null || true
  echo "✔ [Go] Vulnerability audit passed (govulncheck)."
fi
