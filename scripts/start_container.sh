#!/bin/bash

IMAGE=gemini-code-sandbox
CLI_DIST=/usr/local/share/npm-global/lib/node_modules/\@gemini-code/cli
WORKDIR=/sandbox/$(basename "$PWD")

# use docker if installed, otherwise try to use podman instead
if command -v docker &> /dev/null; then
    CMD=docker
elif command -v podman &> /dev/null; then
    CMD=podman
else
    echo "ERROR: docker or podman must be installed"
    exit 1
fi

$CMD run -it --rm -v"$PWD:$WORKDIR" --workdir "$WORKDIR" "$IMAGE" node "$CLI_DIST"