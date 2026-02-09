#!/bin/bash
set -e

INTERNAL_PORT=8081

# A2A server configuration
export CODER_AGENT_PORT="$INTERNAL_PORT"
export CODER_AGENT_WORKSPACE_PATH="${CODER_AGENT_WORKSPACE_PATH:-/workspace}"

# Vertex AI authentication via Workload Identity
export USE_CCPA="true"
export GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-$(curl -s -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/project/project-id 2>/dev/null || echo '')}"

# Headless operation
export GEMINI_FOLDER_TRUST="true"
export GEMINI_YOLO_MODE="true"

# Cloud Run sets PORT (default 8080)
LISTEN_PORT="${PORT:-8080}"

echo "Starting A2A server on localhost:${INTERNAL_PORT}"
echo "Proxying 0.0.0.0:${LISTEN_PORT} -> localhost:${INTERNAL_PORT}"
echo "Project: ${GOOGLE_CLOUD_PROJECT}"
echo "Workspace: ${CODER_AGENT_WORKSPACE_PATH}"

# Start the A2A server in the background
gemini-cli-a2a-server &
A2A_PID=$!

# Wait for the server to be ready
for i in $(seq 1 30); do
  if curl -sf http://localhost:${INTERNAL_PORT}/.well-known/agent-card.json >/dev/null 2>&1; then
    echo "A2A server is ready"
    break
  fi
  if ! kill -0 "$A2A_PID" 2>/dev/null; then
    echo "A2A server process exited unexpectedly"
    exit 1
  fi
  sleep 1
done

# Verify the server started
if ! curl -sf http://localhost:${INTERNAL_PORT}/.well-known/agent-card.json >/dev/null 2>&1; then
  echo "A2A server failed to start within 30 seconds"
  exit 1
fi

# Forward traffic from 0.0.0.0:$PORT to localhost:$INTERNAL_PORT
# socat handles connection forwarding for Cloud Run's health checks and requests
exec socat TCP-LISTEN:${LISTEN_PORT},fork,reuseaddr,bind=0.0.0.0 TCP:localhost:${INTERNAL_PORT}
