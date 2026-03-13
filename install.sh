#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bun remove -g @google/gemini-cli 2>/dev/null || true
bun add -g "$SCRIPT_DIR/packages/cli"
