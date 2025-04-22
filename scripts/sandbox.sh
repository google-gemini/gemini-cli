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

# parse flags
interactive=false
while getopts "i" opt; do
    case "$opt" in
    \?)
        echo "usage: sandbox.sh [-i] [sandbox-name-or-index = AUTO] [command... = bash -l]"
        echo "  -i: enable interactive mode for custom command (enabled by default for login shell)"
        echo "      (WARNING: interactive mode causes stderr to be redirected to stdout)"
        exit 1
        ;;
    i)
        interactive=true
        if [ ! -t 0 ]; then
            echo "ERROR: interactive mode (-i) requested without a terminal attached"
            exit 1
        fi
        ;;
    esac
done
shift $((OPTIND - 1))

IMAGE=gemini-code-sandbox
CMD=$(scripts/sandbox_command.sh)

# list all containers running on sandbox image
sandboxes=()
while IFS= read -r line; do
    sandboxes+=("$line")
done < <($CMD ps --filter "ancestor=$IMAGE" --format "{{.Names}}")

# take first argument as sandbox name if it starts with image name or is an integer
# otherwise require a unique sandbox to be running and take its name
if [[ "${1:-}" =~ ^$IMAGE(-[0-9]+)?$ ]]; then
    SANDBOX=$1
    shift
elif [[ "${1:-}" =~ ^[0-9]+$ ]]; then
    SANDBOX=$IMAGE-$1
    shift
else
    # exit if no sandbox is running
    if [ ${#sandboxes[@]} -eq 0 ]; then
        echo "No sandboxes found. Are you running gemini-code with sandboxing enabled?"
        exit 1
    fi
    # exit if multiple sandboxes are running
    if [ ${#sandboxes[@]} -gt 1 ]; then
        echo "Multiple sandboxes found:"
        for sandbox in "${sandboxes[@]}"; do
            echo "  $sandbox"
        done
        echo "Sandbox name or index (0,1,...) must be specified as first argument"
        exit 1
    fi
    SANDBOX=${sandboxes[0]}
fi

# check that sandbox exists
if ! [[ " ${sandboxes[*]} " == *" $SANDBOX "* ]]; then
    echo "unknown sandbox $SANDBOX"
    echo "known sandboxes:"
    for sandbox in "${sandboxes[@]}"; do
        echo "  $sandbox"
    done
    exit 1
fi

# determine command and args for exec
if [ $# -gt 0 ]; then
    cmd=(bash -l -c "$(printf '%q ' "$@")") # fixes quoting, e.g. bash -c 'echo $SANDBOX'
    exec_args=()
    if [ "$interactive" = true ]; then
        exec_args=(-it)
    fi
else
    cmd=(bash -l)
    exec_args=(-it)
fi

# run command in sandbox
exec_args+=("$SANDBOX" "${cmd[@]}")
$CMD exec "${exec_args[@]}"