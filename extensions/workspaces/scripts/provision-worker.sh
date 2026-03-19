#!/bin/bash
set -e

# Ensure we have a valid environment for non-interactive startup
export USER=${USER:-ubuntu}
export HOME=/home/$USER
export DEBIAN_FRONTEND=noninteractive

echo "🛠️ Provisioning High-Performance Gemini CLI Maintainer Worker..."

# Wait for apt lock
wait_for_apt() {
  while sudo fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock >/dev/null 2>&1 ; do
    sleep 2
  done
}

wait_for_apt

# 1. System Essentials (Inc. libraries for native node modules)
apt-get update && apt-get install -y \
    curl git git-lfs tmux build-essential unzip jq gnupg cron \
    libsecret-1-dev libkrb5-dev

# 2. GitHub CLI
if ! command -v gh &> /dev/null; then
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    wait_for_apt
    apt-get update && apt-get install gh -y
fi

# 3. Direct Node.js 20 Installation (NodeSource)
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    wait_for_apt
    apt-get install -y nodejs
fi

# 4. Global Maintenance Tooling
echo "Installing global developer tools..."
npm install -g tsx vitest @google/gemini-cli@nightly

# 5. Pre-warm Repository (Main Hub)
# We clone and build the main repo in the image so that new worktrees start with a warm cache
REMOTE_WORK_DIR="$HOME/dev/main"
mkdir -p "$HOME/dev"
if [ ! -d "$REMOTE_WORK_DIR" ]; then
    echo "Pre-cloning and building repository..."
    git clone --filter=blob:none https://github.com/google-gemini/gemini-cli.git "$REMOTE_WORK_DIR"
    cd "$REMOTE_WORK_DIR"
    npm install --no-audit --no-fund
    npm run build
fi

chown -R $USER:$USER $HOME/dev
echo "✅ Provisioning Complete!"
