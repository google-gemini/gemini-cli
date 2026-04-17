#!/bin/bash
# Running User Simulation in Docker with External Knowledge Source
# 
# This script automates the process of building the sandbox image and running
# the User Simulator inside it, while mounting a local workspace for persistent
# artifacts, logs, and knowledge state.

set -e

# Default values
TASK_PROMPT=${1:-"make a snake game in python"}
WORKSPACE_DIR=${2:-"$(pwd)/simulator_workspace_$(date +%s)"}
KNOWLEDGE_FILE="$WORKSPACE_DIR/knowledge.md"
LOG_FILE="$WORKSPACE_DIR/debug_$(date +%s).log"

echo "========================================================"
echo "🚀 Setting up Simulator Docker Environment..."
echo "========================================================"
echo "Workspace: $WORKSPACE_DIR"
echo "Task: $TASK_PROMPT"
echo "--------------------------------------------------------"

# 1. Prepare Workspace
mkdir -p "$WORKSPACE_DIR"
chmod 777 "$WORKSPACE_DIR"

if [ ! -f "$KNOWLEDGE_FILE" ]; then
    touch "$KNOWLEDGE_FILE"
    chmod 777 "$KNOWLEDGE_FILE"
    echo "[INFO] Created new knowledge file at $KNOWLEDGE_FILE"
else
    echo "[INFO] Using existing knowledge file at $KNOWLEDGE_FILE"
fi

# Create a project-level settings.json to natively bypass trust and auth dialogs.
# The simulator's AI brain (content generator) is only initialized AFTER the CLI is authenticated.
# Pre-configuring these settings prevents a Catch-22 where the simulator is stuck on the auth page.
mkdir -p "$WORKSPACE_DIR/.gemini"
chmod 777 "$WORKSPACE_DIR/.gemini"
SETTINGS_FILE="$WORKSPACE_DIR/.gemini/settings.json"
echo '{
  "security": {
    "auth": {
      "selectedType": "gemini-api-key"
    },
    "folderTrust": {
      "enabled": false
    }
  }
}' > "$SETTINGS_FILE"
chmod 777 "$SETTINGS_FILE"

# 2. Build the Sandbox Image (ensuring latest code is used)
echo ""
echo "📦 Building Sandbox Image..."
echo "This ensures any recent code changes are included in the image."
GEMINI_SANDBOX=docker npm run build:sandbox -- -i gemini-cli-simulator:latest

# 3. Run the Simulation
echo ""
echo "🤖 Starting Simulation..."
echo "Logs will be written to: $LOG_FILE"
echo "Press Ctrl+C to terminate early."
echo ""

# Note: We run the container directly with --init so that Ctrl+C cleanly kills the process.
# We mount the workspace and specifically mount the generated settings.json as the 
# container's global user settings. This natively bypasses the initial interactive dialogs.
docker run -it --rm --init \
  -v "$WORKSPACE_DIR:/workspace" \
  -v "$SETTINGS_FILE:/home/node/.gemini/settings.json" \
  -w /workspace \
  -e GEMINI_API_KEY="$GEMINI_API_KEY" \
  -e GEMINI_DEBUG_LOG_FILE="/workspace/$(basename "$LOG_FILE")" \
  gemini-cli-simulator:latest \
  gemini --prompt-interactive "$TASK_PROMPT" \
  --approval-mode plan \
  --simulate-user \
  --knowledge-source "/workspace/$(basename "$KNOWLEDGE_FILE")"

echo ""
echo "✅ Simulation completed."
echo "Check $WORKSPACE_DIR for generated artifacts, logs, and updated knowledge source."
