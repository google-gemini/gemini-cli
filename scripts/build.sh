#!/bin/bash
set -euo pipefail

# npm install if node_modules was removed (e.g. via npm run clean or scripts/clean.sh)
if [ ! -d "node_modules" ]; then
    npm install
fi

# build all workspaces/packages
npm run build --workspaces

# also build container image if GEMINI_CODE_SANDBOX is set (can be in .env file)
# skip (-s) npm install + build since we did that above
if [[ "${GEMINI_CODE_SANDBOX:-}" =~ ^(1|true)$ ]] || grep -qiE '^GEMINI_CODE_SANDBOX *= *(1|true)' .env; then
    scripts/build_sandbox.sh -s
fi
