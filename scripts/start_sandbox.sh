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

if ! scripts/sandbox_command.sh -q; then
    echo "ERROR: sandboxing disabled. See README.md to enable sandboxing."
    exit 1
fi

CMD=$(scripts/sandbox_command.sh)
IMAGE=gemini-code-sandbox
WORKDIR=/sandbox/$(basename "$PWD")
CLI_PATH=/usr/local/share/npm-global/lib/node_modules/\@gemini-code/cli
DEBUG_PORT=9229

# use interactive tty mode and auto-remove container on exit
run_args=(-it --rm)

# mount current directory as $WORKDIR inside container
run_args+=(-v "$PWD:$WORKDIR")

# mount $TMPDIR as /tmp inside container
run_args+=(-v "${TMPDIR:-/tmp/}:/tmp")

# name container after image, plus numeric suffix to avoid conflicts
INDEX=0
while $CMD ps -a --format "{{.Names}}" | grep -q "$IMAGE-$INDEX"; do
    INDEX=$((INDEX + 1))
done
run_args+=(--name "$IMAGE-$INDEX" --hostname "$IMAGE-$INDEX")

# if .env exists, source it before variable existence checks below
# allow .env to be in any ancestor directory (same as findEnvFile in config.ts)
current_dir=$(pwd)
while [ "$current_dir" != "/" ]; do
    if [ -f "$current_dir/.env" ]; then
        source "$current_dir/.env"
        break
    fi
    current_dir=$(dirname "$current_dir")
done

# copy GEMINI_API_KEY
if [ -n "${GEMINI_API_KEY:-}" ]; then run_args+=(--env GEMINI_API_KEY="$GEMINI_API_KEY"); fi

# copy SHELL_TOOL to optionally enable shell tool
if [ -n "${SHELL_TOOL:-}" ]; then run_args+=(--env SHELL_TOOL="$SHELL_TOOL"); fi

# copy TERM and COLORTERM to try to maintain terminal setup
if [ -n "${TERM:-}" ]; then run_args+=(--env TERM="$TERM"); fi
if [ -n "${COLORTERM:-}" ]; then run_args+=(--env COLORTERM="$COLORTERM"); fi

# set SANDBOX environment variable as container name
# this is the preferred mechanism to detect if inside container/sandbox
run_args+=(--env "SANDBOX=$IMAGE-$INDEX")

# enable debugging via node --inspect-brk (and $DEBUG_PORT) if DEBUG is set
node_args=()
if [ -n "${DEBUG:-}" ]; then
    node_args+=(--inspect-brk="0.0.0.0:$DEBUG_PORT")
    run_args+=(-p "$DEBUG_PORT:$DEBUG_PORT")
fi
node_args+=("$CLI_PATH" "$@")

# run gemini-code in sandbox container
if [[ "$CMD" == "podman" ]]; then
    # use empty --authfile to skip unnecessary auth refresh overhead
    $CMD run "${run_args[@]}" --init --authfile <(echo '{}') --workdir "$WORKDIR" "$IMAGE" node "${node_args[@]}"
else
    $CMD run "${run_args[@]}" --init --workdir "$WORKDIR" "$IMAGE" node "${node_args[@]}"
fi
