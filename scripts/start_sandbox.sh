#!/bin/bash
set -euo pipefail

IMAGE=gemini-code-sandbox
WORKDIR=/sandbox/$(basename "$PWD")
CLI_DIST=/usr/local/share/npm-global/lib/node_modules/\@gemini-code/cli

# use docker if installed, otherwise try to use podman instead
if command -v docker &> /dev/null; then
    CMD=docker
elif command -v podman &> /dev/null; then
    CMD=podman
else
    echo "ERROR: missing docker or podman for sandboxing"
    exit 1
fi

# use interactive tty mode and auto-remove container on exit
run_args=(-it --rm)

# mount current directory as $WORKDIR inside container
run_args+=(-v "$PWD:$WORKDIR")

# name container after image, plus numeric suffix to avoid conflicts
INDEX=0
while $CMD ps -a --format "{{.Names}}" | grep -q "$IMAGE-$INDEX"; do
    INDEX=$((INDEX + 1))
done
run_args+=(--name "$IMAGE-$INDEX")

# run gemini-code in sandbox container
# use empty --authfile to skip unnecessary auth refresh overhead
$CMD run "${run_args[@]}" --authfile <(echo '{}') --workdir "$WORKDIR" "$IMAGE" node "$CLI_DIST"