#!/bin/bash
set -euo pipefail

IMAGE=gemini-code-sandbox

# use docker if installed, otherwise try to use podman instead
if command -v docker &> /dev/null; then
    CMD=docker
elif command -v podman &> /dev/null; then
    CMD=podman
else
    echo "ERROR: docker or podman must be installed"
    exit 1
fi

npm install
npm run build
rm -f packages/cli/dist/gemini-code-cli-*.tgz
npm pack -w @gemini-code/cli --pack-destination ./packages/cli/dist
rm -f packages/server/dist/gemini-code-server-*.tgz
npm pack -w @gemini-code/server --pack-destination ./packages/server/dist

$CMD build -t "$IMAGE" .