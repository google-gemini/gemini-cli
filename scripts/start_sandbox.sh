#!/bin/bash
set -euo pipefail

IMAGE=gemini-code-sandbox
CLI_DIST=/usr/local/share/npm-global/lib/node_modules/\@gemini-code/cli
WORKDIR=/sandbox/$(basename "$PWD")

# use docker if installed, otherwise try to use podman instead
if command -v docker &> /dev/null; then
    CMD=docker
elif command -v podman &> /dev/null; then
    CMD=podman
else
    echo "ERROR: missing docker or podman for sandboxing"
    exit 1
fi

# run gemini-code in sandbox container
# use empty --authfile to skip unnecessary auth refresh overhead
$CMD run -it --rm --authfile <(echo '{}') -v"$PWD:$WORKDIR" --workdir "$WORKDIR" "$IMAGE" node "$CLI_DIST"