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
DEBUG_PORT=${DEBUG_PORT:-9229}
PROJECT=$(basename "$PWD")
WORKDIR=$PWD
CLI_PATH=/usr/local/share/npm-global/lib/node_modules/\@gemini-code/cli

# if project is gemini-code, then switch to -dev image & run CLI from $WORKDIR/packages/cli
if [[ "$PROJECT" == "gemini-code" ]]; then
    IMAGE+="-dev"
    CLI_PATH="$WORKDIR/packages/cli"
fi

# stop if image is missing
if ! $CMD images -q "$IMAGE" | grep -q .; then
    echo "ERROR: $IMAGE is missing. Try \`npm run build\` with sandboxing enabled."
    exit 1
fi

# use interactive tty mode and auto-remove container on exit
# run init binary inside container to forward signals & reap zombies
run_args=(-it --rm --init --workdir "$WORKDIR")

# mount current directory as $WORKDIR inside container
run_args+=(-v "$PWD:$WORKDIR")

# mount $TMPDIR as /tmp inside container
run_args+=(-v "${TMPDIR:-/tmp/}:/tmp")

# if .env exists, source it before checking/parsing environment variables below
# allow .env to be in any ancestor directory (same as findEnvFile in config.ts)
current_dir=$(pwd)
while [ "$current_dir" != "/" ]; do
    if [ -f "$current_dir/.env" ]; then
        source "$current_dir/.env"
        break
    fi
    current_dir=$(dirname "$current_dir")
done

# mount paths listed in SANDBOX_MOUNTS
if [ -n "${SANDBOX_MOUNTS:-}" ]; then
    mounts=$(echo "$SANDBOX_MOUNTS" | tr ',' '\n')
    for mount in $mounts; do
        if [ -n "$mount" ]; then
            # parse mount as from:to:opts
            IFS=':' read -r from to opts <<<"$mount"
            to=${to:-"$from"}  # default to mount at same path inside container
            opts=${opts:-"ro"} # default to read-only
            mount="$from:$to:$opts"
            # check that $from is absolute
            if [[ "$from" != /* ]]; then
                echo "ERROR: path '$from' listed in SANDBOX_MOUNTS must be absolute"
                exit 1
            fi
            # check that $from path exists on host
            if [ ! -e "$from" ]; then
                echo "ERROR: missing mount path '$from' listed in SANDBOX_MOUNTS"
                exit 1
            fi
            echo "SANDBOX_MOUNTS: $from -> $to ($opts)"
            run_args+=(-v "$mount")
        fi
    done
fi

# name container after image, plus numeric suffix to avoid conflicts
INDEX=0
while $CMD ps -a --format "{{.Names}}" | grep -q "$IMAGE-$INDEX"; do
    INDEX=$((INDEX + 1))
done
run_args+=(--name "$IMAGE-$INDEX" --hostname "$IMAGE-$INDEX")

# copy GEMINI_API_KEY
if [ -n "${GEMINI_API_KEY:-}" ]; then run_args+=(--env GEMINI_API_KEY="$GEMINI_API_KEY"); fi

# copy GEMINI_CODE_MODEL
if [ -n "${GEMINI_CODE_MODEL:-}" ]; then run_args+=(--env GEMINI_CODE_MODEL="$GEMINI_CODE_MODEL"); fi

# copy TERMINAL_TOOL to optionally revert to old terminal tool
if [ -n "${TERMINAL_TOOL:-}" ]; then run_args+=(--env TERMINAL_TOOL="$TERMINAL_TOOL"); fi

# copy TERM and COLORTERM to try to maintain terminal setup
if [ -n "${TERM:-}" ]; then run_args+=(--env TERM="$TERM"); fi
if [ -n "${COLORTERM:-}" ]; then run_args+=(--env COLORTERM="$COLORTERM"); fi

# copy additional environment variables from SANDBOX_ENV
if [ -n "${SANDBOX_ENV:-}" ]; then
    envs=$(echo "$SANDBOX_ENV" | tr ',' '\n')
    for env in $envs; do
        if [ -n "$env" ]; then
            if [[ "$env" == *=* ]]; then
                echo "SANDBOX_ENV: $env"
                run_args+=(--env "$env")
            else
                echo "ERROR: SANDBOX_ENV must be a comma-separated list of key=value pairs"
                exit 1
            fi
        fi
    done
fi

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

# open additional ports if SANDBOX_PORTS is set
# also set up redirects (via socat) so servers can listen on localhost instead of 0.0.0.0
bash_cmd=""
if [ -n "${SANDBOX_PORTS:-}" ]; then
    ports=$(echo "$SANDBOX_PORTS" | tr ',' '\n')
    for port in $ports; do
        if [ -n "$port" ]; then
            echo "SANDBOX_PORTS: $port"
            run_args+=(-p "$port:$port")
            bash_cmd+="socat TCP4-LISTEN:$port,bind=\$(hostname -i),fork,reuseaddr TCP4:127.0.0.1:$port 2> /dev/null& "
        fi
    done
fi
bash_cmd+="node $(printf '%q ' "${node_args[@]}")" # printf fixes quoting within args

# run gemini-code in sandbox container
if [[ "$CMD" == "podman" ]]; then
    # use empty --authfile to skip unnecessary auth refresh overhead
    $CMD run "${run_args[@]}" --authfile <(echo '{}') "$IMAGE" bash -c "$bash_cmd"
else
    $CMD run "${run_args[@]}" "$IMAGE" bash -c "$bash_cmd"
fi
