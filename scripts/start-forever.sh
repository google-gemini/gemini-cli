#!/usr/bin/env bash
# Start the forever agent + chat bridge together.
# Usage: ./scripts/start-forever.sh
#
# Required env vars:
#   GOOGLE_API_KEY          - Gemini API key
#   GOOGLE_APPLICATION_CREDENTIALS - path to service account key (for Chat API)
#
# Optional env vars:
#   A2A_PORT                - external listener port (default: 3100)
#   BRIDGE_PORT             - chat bridge port (default: 8081)
#   CHAT_PROJECT_NUMBER     - Google Cloud project number (for JWT verification)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default ports
export A2A_PORT="${A2A_PORT:-3100}"
export BRIDGE_PORT="${BRIDGE_PORT:-8081}"
export A2A_URL="${A2A_URL:-http://127.0.0.1:${A2A_PORT}}"

echo "=== Gemini CLI Forever Agent ==="
echo "Agent listener: localhost:${A2A_PORT}"
echo "Chat bridge:    0.0.0.0:${BRIDGE_PORT}"
echo ""

# Build if needed
if [ ! -d "$REPO_ROOT/packages/a2a-server/dist" ]; then
  echo "Building a2a-server..."
  cd "$REPO_ROOT" && npm run build --workspace=packages/a2a-server
fi

# Start the chat bridge in the background
echo "Starting chat bridge..."
node "$REPO_ROOT/packages/a2a-server/dist/src/chat-bridge/bridge.js" &
BRIDGE_PID=$!

# Cleanup on exit
cleanup() {
  echo "Shutting down..."
  kill "$BRIDGE_PID" 2>/dev/null || true
  wait "$BRIDGE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Start the forever agent in the foreground
echo "Starting forever agent..."
cd "$REPO_ROOT"
npx gemini --forever --a2a-port "$A2A_PORT" --yolo

# If the agent exits, cleanup will fire
