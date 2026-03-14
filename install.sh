#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Build first — don't remove the working version until we know the new one builds
echo "Building..."
bun run build

echo "Running generate script..."
bun run generate

# Only remove the old version after a successful build
bun remove -g @google/gemini-cli 2>/dev/null || true

echo "Installing Gemini CLI globally..."
bun add -g "$SCRIPT_DIR/packages/cli"

echo "Gemini CLI installed globally."
