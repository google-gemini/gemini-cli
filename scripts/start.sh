#!/bin/bash
set -euo pipefail

node ./scripts/check-build-status.js
node node_modules/@gemini-code/cli "$@"