#!/usr/bin/env bash
set -euo pipefail

echo "🔍 [Check 1/5] Scanning staged files for sensitive tokens & credentials..."

STAGED_FILES=$(git diff --cached --name-only || true)

if [ -z "$STAGED_FILES" ]; then
  echo "✔ [Secrets] No staged files to scan."
  exit 0
fi

# 1. Check for forbidden filenames
FORBIDDEN_FILES_REGEX='(^|/)(\.env|\.env\..*|auth\.json|.*\.pem|.*\.key|id_rsa|id_ed25519)$'
SUSPICIOUS_FILES=$(echo "$STAGED_FILES" | grep -E "$FORBIDDEN_FILES_REGEX" || true)

if [ -n "$SUSPICIOUS_FILES" ]; then
  echo "❌ [Secrets] Blocked commit: sensitive filename(s) detected in staged files:"
  echo "$SUSPICIOUS_FILES"
  exit 1
fi

# 2. Check diff content for leaked private keys, OAuth tokens, and API keys
STAGED_DIFF=$(git diff --cached --diff-filter=ACM || true)

LEAKS=0

check_pattern() {
  local pattern="$1"
  local description="$2"
  if echo "$STAGED_DIFF" | grep -E -q -e "$pattern"; then
    echo "❌ [Secrets] Leak detected: $description"
    LEAKS=1
  fi
}

check_pattern '-----BEGIN [A-Z ]*PRIVATE KEY-----' "Private cryptographic key header"
check_pattern 'ya29\.[a-zA-Z0-9_\-]{30,}' "Google OAuth access token"
check_pattern '1\/\/[a-zA-Z0-9_\-]{30,}' "Google OAuth refresh token"
check_pattern 'sk-ant-[a-zA-Z0-9_\-]{20,}' "Anthropic API key"
check_pattern 'sk-proj-[a-zA-Z0-9_\-]{20,}' "OpenAI project API key"

if [ "$LEAKS" -ne 0 ]; then
  echo "❌ [Secrets] Commit aborted to prevent secret leakage. Unstage credentials before committing."
  exit 1
fi

echo "✔ [Secrets] Clean. Zero leaked credentials detected."
