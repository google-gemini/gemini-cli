#!/bin/bash
set -euo pipefail

node ./scripts/check-build-status.js
node --inspect-brk node_modules/@gemini-code/cli "$@"