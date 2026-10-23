#!/usr/bin/env bash
set -euo pipefail

# Cobot 1-Click Zero-Domain Quick Tunnel & Pairing Utility
# Spins up trycloudflare.com tunnel to agent-daemon and generates pairing token

PORT="${PORT:-3000}"
RUNTIME_DIR="${HOME}/.cobot/runtime"
mkdir -p "${RUNTIME_DIR}"
TUNNEL_FILE="${RUNTIME_DIR}/tunnel.json"

echo "⚡ [Cobot Tunnel] Initiating zero-domain Cloudflare Quick Tunnel on port ${PORT}..."

if ! command -v cloudflared &> /dev/null; then
  echo "❌ 'cloudflared' binary not found. Please install via: 'curl -fsSL https://pkg.cloudflare.com/cloudflared-ascii.repo'"
  exit 1
fi

TOKEN="cobot_pair_$(openssl rand -hex 12)"
LOG_FILE="/tmp/cobot-cloudflared.log"
rm -f "${LOG_FILE}"

# Spawn cloudflared quick tunnel in background
cloudflared tunnel --url "http://localhost:${PORT}" > "${LOG_FILE}" 2>&1 &
TUNNEL_PID=$!

echo "⏳ Waiting for Cloudflare edge routing..."
TUNNEL_URL=""
for i in {1..20}; do
  if [ -f "${LOG_FILE}" ]; then
    TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]\+\.trycloudflare\.com' "${LOG_FILE}" | head -n 1 || true)
    if [ -n "${TUNNEL_URL}" ]; then
      break
    fi
  fi
  sleep 1
done

if [ -z "${TUNNEL_URL}" ]; then
  echo "❌ Timed out waiting for Cloudflare Quick Tunnel URL. Check ${LOG_FILE}"
  kill "${TUNNEL_PID}" 2>/dev/null || true
  exit 1
fi

cat <<EOF > "${TUNNEL_FILE}"
{
  "endpoint": "${TUNNEL_URL}",
  "token": "${TOKEN}",
  "pid": ${TUNNEL_PID},
  "created_at": $(date +%s)
}
EOF

echo ""
echo "================================================================="
echo " 🎉 Cobot Zero-Domain Tunnel Active!"
echo " Public Endpoint: ${TUNNEL_URL}"
echo " Pairing Token:   ${TOKEN}"
echo " Config Saved:    ${TUNNEL_FILE}"
echo "================================================================="
echo ""

if command -v qrencode &> /dev/null; then
  PAIR_PAYLOAD="{\"endpoint\":\"${TUNNEL_URL}\",\"token\":\"${TOKEN}\"}"
  echo "📱 Scan this QR code with the Cobot Mobile App:"
  echo ""
  qrencode -t ANSI256 "${PAIR_PAYLOAD}"
  echo ""
else
  echo "💡 Tip: Install 'qrencode' to render terminal QR codes directly."
fi

echo "Press Ctrl+C to close tunnel."
trap "kill ${TUNNEL_PID} 2>/dev/null; rm -f ${TUNNEL_FILE}; echo 'Tunnel stopped.'; exit 0" INT TERM
wait "${TUNNEL_PID}"
