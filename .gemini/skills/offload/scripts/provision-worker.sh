#!/bin/bash
set -e

# Ensure we have a valid environment for non-interactive startup
export USER=${USER:-ubuntu}
export HOME=/home/$USER
export DEBIAN_FRONTEND=noninteractive

echo "🛠️ Provisioning Gemini CLI Maintainer Worker for user: $USER"

# Wait for apt lock
wait_for_apt() {
  echo "Waiting for apt lock..."
  while sudo fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock >/dev/null 2>&1 ; do
    sleep 2
  done
}

wait_for_apt

# 1. System Essentials
apt-get update && apt-get install -y \
    curl git git-lfs tmux build-essential unzip jq gnupg cron

# 2. GitHub CLI
if ! command -v gh &> /dev/null; then
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    wait_for_apt
    apt-get update && apt-get install gh -y
fi

# 3. Direct Node.js 20 Installation (NodeSource)
echo "Removing any existing nodejs/npm..."
wait_for_apt
apt-get purge -y nodejs npm || true
apt-get autoremove -y

echo "Installing Node.js 20 via NodeSource..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
wait_for_apt
apt-get install -y nodejs

# Verify installations
node -v
npm -v

# 4. Install Gemini CLI (Nightly)
echo "Installing Gemini CLI..."
npm install -g @google/gemini-cli@nightly

# 5. Self-Deletion Cron (Safety)
(crontab -u $USER -l 2>/dev/null; echo "0 0 * * * gcloud compute instances delete $(hostname) --zone $(curl -H Metadata-Flavor:Google http://metadata.google.internal/computeMetadata/v1/instance/zone | cut -d/ -f4) --quiet") | crontab -u $USER -

echo "✅ Provisioning Complete!"
