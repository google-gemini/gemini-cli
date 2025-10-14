#!/bin/bash
# Autonomous Gemini CLI Runner
# This ensures you run the modified local version, not the global install

cd "$(dirname "$0")"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 AUTONOMOUS GEMINI CLI"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📍 Running from: $(pwd)"
echo ""
echo "✅ Features Active:"
echo "   • 8 AI models available (type: /model)"
echo "   • /plan command for optional planning"
echo "   • No permission requests (YOLO mode)"
echo "   • Unlimited API usage (quota disabled)"
echo "   • Unlimited time and turns"
echo "   • Universal file access"
echo ""
echo "🧪 Quick Tests:"
echo "   /model  - See all 8 models"
echo "   /plan   - Test plan mode"
echo "   /help   - See all commands"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run the local version directly with explicit YOLO mode
# The --approval-mode=yolo argument ensures no permission requests
node packages/cli --approval-mode=yolo "$@"
