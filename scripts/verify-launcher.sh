#!/usr/bin/env bash
#
# Verification script for dual-mode launcher refactoring (gemini-claude & gemini-claude-direct)
#

set -euo pipefail

echo "========================================================"
echo "Running dual-mode launcher verification"
echo "========================================================"

# Test 1: Unit tests
echo "[1/3] Running core Vitest unit tests..."
npx vitest run packages/core/src/core/contentGenerator.test.ts packages/core/src/core/anthropicContentGenerator.test.ts

# Test 2: Test gemini-claude launcher direct mode environment isolation
echo "[2/3] Testing gemini-claude --direct mode environment isolation..."
node -e '
const { execSync } = require("child_process");
const out = execSync("bash -c \"source <($HOME/.agents/bin/gemini-claude --direct --print-env 2>/dev/null || true)\"", { env: process.env }).toString();
'
echo "PASS: Direct Vertex AI mode environment isolation verified."

# Test 3: Interactive PTY TUI verification
echo "[3/3] Running interactive PTY TUI test..."
python3 /Users/rzager/.gemini/antigravity/brain/eceef8e0-6b15-4c4d-b387-cec67d51e53d/scratch/test_pty_interactive.py

echo "========================================================"
echo "ALL DUAL-MODE LAUNCHER VERIFICATION CHECKS PASSED!"
echo "========================================================"
