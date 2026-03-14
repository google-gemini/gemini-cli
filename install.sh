#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bun remove -g @google/gemini-cli 2>/dev/null || true

# Build core packages (skip sandbox and vscode companion)
echo "Building..."
bun run build

echo "Running generate script..."
bun run generate

echo "Installing Gemini CLI globally..."
bun add -g "$SCRIPT_DIR/packages/cli"

echo "Gemini CLI installed globally."
