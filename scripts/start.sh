#!/bin/bash
set -euo pipefail

# check build status, write warnings to file for app to display if needed
node ./scripts/check-build-status.js

# if GEMINI_CODE_SANDBOX is set (can be in .env file), start in sandbox container
if [[ "${GEMINI_CODE_SANDBOX:-}" =~ ^(1|true)$ ]] || grep -qiE '^GEMINI_CODE_SANDBOX *= *(1|true)' .env; then
    echo "Running in sandbox container ..."
    scripts/start_sandbox.sh "$@"
else
    echo "WARNING: running outside of sandbox. Set GEMINI_CODE_SANDBOX to enable sandbox."
    node node_modules/@gemini-code/cli "$@"
fi