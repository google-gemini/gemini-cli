#!/bin/bash
# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -euo pipefail

IMAGE=gemini-code-sandbox
WORKDIR=/sandbox/$(basename "$PWD")
CLI_PATH=/usr/local/share/npm-global/lib/node_modules/\@gemini-code/cli
DEBUG_PORT=9229

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

# mount $TMPDIR as /tmp inside container
run_args+=(-v "$TMPDIR:/tmp")

# name container after image, plus numeric suffix to avoid conflicts
INDEX=0
while $CMD ps -a --format "{{.Names}}" | grep -q "$IMAGE-$INDEX"; do
    INDEX=$((INDEX + 1))
done
run_args+=(--name "$IMAGE-$INDEX" --hostname "$IMAGE-$INDEX")

# also set SANDBOX environment variable as container name
run_args+=(--env "SANDBOX=$IMAGE-$INDEX")

# pass TERM and COLORTERM to container to maintain terminal colors
run_args+=(--env "TERM=$TERM" --env "COLORTERM=$COLORTERM")

# enable debugging via node --inspect-brk (and $DEBUG_PORT) if DEBUG is set
node_args=()
if [ -n "${DEBUG:-}" ]; then
    node_args+=(--inspect-brk="0.0.0.0:$DEBUG_PORT")
    run_args+=(-p "$DEBUG_PORT:$DEBUG_PORT")
fi
node_args+=("$CLI_PATH" "$@")

# run gemini-code in sandbox container
# use empty --authfile to skip unnecessary auth refresh overhead
$CMD run "${run_args[@]}" --init --authfile <(echo '{}') --workdir "$WORKDIR" "$IMAGE" node "${node_args[@]}"