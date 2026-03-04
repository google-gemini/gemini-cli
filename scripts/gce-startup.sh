#!/usr/bin/env bash
# GCE startup script — runs on VM boot.
# Installs Node.js, clones, builds, starts forever agent + bridge.
# Pass gemini-api-key via instance metadata.
set -euo pipefail

LOG="/var/log/forever-agent-startup.log"
exec > >(tee -a "$LOG") 2>&1
echo "=== Forever Agent startup $(date) ==="

# Read API key from instance metadata
GEMINI_API_KEY=$(curl -sf -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/attributes/gemini-api-key" || echo "")
CHAT_PROJECT_NUMBER=$(curl -sf -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/attributes/chat-project-number" || echo "")

if [ -z "$GEMINI_API_KEY" ]; then
  echo "ERROR: gemini-api-key not set in instance metadata"
  exit 1
fi
echo "API key loaded (${#GEMINI_API_KEY} chars)"

# Install Node.js + screen (first boot only)
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs git screen
fi
echo "Node $(node --version)"

# Clone/update repo
REPO_DIR="/opt/forever-agent"
if [ ! -d "$REPO_DIR" ]; then
  GIT_TERMINAL_PROMPT=0 git clone -b afw/forever-gchat \
    https://github.com/google-gemini/gemini-cli.git "$REPO_DIR"
else
  cd "$REPO_DIR" && GIT_TERMINAL_PROMPT=0 git pull --ff-only || true
fi

# npm install && npm run build
cd "$REPO_DIR"
npm install 2>&1 | tail -5
npm run build 2>&1 | tail -10

# Pre-create workspace and config to skip interactive prompts
WORK_DIR="/opt/forever-workspace"
mkdir -p "$WORK_DIR/.gemini"
mkdir -p /root/.gemini

# Pre-trust the workspace folder (skips "Do you trust this folder?" dialog)
# --yolo doesn't bypass folder trust, so we must pre-configure it
cat > /root/.gemini/trustedFolders.json << 'TRUSTEOF'
{
  "/opt/forever-workspace": "TRUST_FOLDER"
}
TRUSTEOF

# Disable folder trust + skip session retention dialog
# Write to both user-level AND workspace-level to be safe
for SETTINGS_DIR in /root/.gemini "$WORK_DIR/.gemini"; do
  mkdir -p "$SETTINGS_DIR"
  cat > "$SETTINGS_DIR/settings.json" << 'SETTINGSEOF'
{
  "security": {
    "folderTrust": {
      "enabled": false
    },
    "auth": {
      "selectedType": "gemini-api-key",
      "useExternal": true
    }
  },
  "general": {
    "sessionRetention": {
      "enabled": true,
      "maxAge": "30d",
      "warningAcknowledged": true
    }
  }
}
SETTINGSEOF
done

cat > "$WORK_DIR/.gemini/GEMINI.md" << 'GEMINIEOF'
---
sisyphus:
  enabled: true
  idleTimeout: 30
  prompt: "continue with the next task"
---

# Mission
You are a forever-running autonomous agent accessible via Google Chat.
Process incoming tasks, answer questions, and proactively work on improvements.
GEMINIEOF

# Create systemd service for the chat bridge (Pub/Sub mode)
cat > /etc/systemd/system/chat-bridge.service << EOF
[Unit]
Description=Google Chat Bridge (Pub/Sub)
After=network.target

[Service]
Type=simple
Environment=A2A_URL=http://127.0.0.1:3100
Environment=GOOGLE_CLOUD_PROJECT=adamfweidman-test
Environment=PUBSUB_SUBSCRIPTION=forever-agent-chat-sub
Environment=GIT_TERMINAL_PROMPT=0
WorkingDirectory=${REPO_DIR}
ExecStart=/usr/bin/node ${REPO_DIR}/packages/a2a-server/dist/src/chat-bridge/bridge.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Write env vars to a file — sourced by the wrapper script
cat > /etc/forever-agent.env << ENVEOF
export HOME=/root
export GEMINI_CLI_HOME=/root
export GOOGLE_API_KEY='${GEMINI_API_KEY}'
export GEMINI_API_KEY='${GEMINI_API_KEY}'
export A2A_PORT=3100
export GIT_TERMINAL_PROMPT=0
ENVEOF
chmod 600 /etc/forever-agent.env

# Create a wrapper script that sources env and uses 'script' for pseudo-TTY
cat > /usr/local/bin/start-forever-agent.sh << 'WRAPPEREOF'
#!/usr/bin/env bash
set -a
source /etc/forever-agent.env
set +a
# script provides a pseudo-TTY for Ink; output goes to /dev/null (TUI noise)
exec /usr/bin/script -qfc "node /opt/forever-agent/packages/cli/dist/index.js --forever --a2a-port 3100 --yolo" /dev/null
WRAPPEREOF
chmod +x /usr/local/bin/start-forever-agent.sh

# Create systemd service for the forever agent
cat > /etc/systemd/system/forever-agent.service << EOF
[Unit]
Description=Gemini CLI Forever Agent
After=network.target chat-bridge.service

[Service]
Type=simple
Environment=GOOGLE_API_KEY=${GEMINI_API_KEY}
Environment=A2A_PORT=3100
Environment=GIT_TERMINAL_PROMPT=0
Environment=HOME=/root
Environment=GEMINI_CLI_HOME=/root
WorkingDirectory=${WORK_DIR}
ExecStart=/usr/local/bin/start-forever-agent.sh
Restart=on-failure
RestartSec=10
StandardOutput=null
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Start both services
systemctl daemon-reload
systemctl enable chat-bridge forever-agent
systemctl start chat-bridge
sleep 2
systemctl start forever-agent

echo "=== Chat bridge started on port 8081 ==="
echo "=== Forever agent started in screen session ==="
echo "=== Startup complete $(date) ==="
