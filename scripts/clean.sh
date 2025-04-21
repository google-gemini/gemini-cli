#!/bin/bash
set -euo pipefail

# remove npm install/build artifacts
rm -rf node_modules
npm run clean --workspaces
