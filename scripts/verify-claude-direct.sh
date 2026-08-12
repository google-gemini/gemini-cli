#!/usr/bin/env bash
#
# Verification script for gemini-claude-direct model routing
#

set -euo pipefail

echo "========================================================"
echo "Running gemini-claude-direct model routing verification"
echo "========================================================"

# Test 1: Unit tests
echo "[1/3] Running AnthropicContentGenerator unit tests..."
npx vitest run packages/core/src/core/anthropicContentGenerator.test.ts

# Test 2: Live end-to-end verification for claude-sonnet-5
echo "[2/3] Running live model check for claude-sonnet-5..."
OUTPUT_SONNET=$(gemini-claude-direct -m claude-sonnet-5 -p "hello" 2>&1)
echo "$OUTPUT_SONNET" | grep -q "Remote provider returned message model ID: claude-sonnet-5" || {
  echo "FAIL: Expected remote model ID 'claude-sonnet-5' not found in output!"
  exit 1
}
echo "PASS: Remote provider returned model ID 'claude-sonnet-5'"

# Test 3: Live end-to-end verification for claude-opus-5
echo "[3/3] Running live model check for claude-opus-5..."
OUTPUT_OPUS=$(gemini-claude-direct -m claude-opus-5 -p "hello" 2>&1)
echo "$OUTPUT_OPUS" | grep -q "Remote provider returned message model ID: claude-opus-5" || {
  echo "FAIL: Expected remote model ID 'claude-opus-5' not found in output!"
  exit 1
}
echo "PASS: Remote provider returned model ID 'claude-opus-5'"

echo "========================================================"
echo "ALL MODEL ROUTING VERIFICATION CHECKS PASSED SUCCESSFULLY!"
echo "========================================================"
