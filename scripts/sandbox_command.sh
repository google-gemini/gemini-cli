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

# usage: scripts/sandbox_command.sh [-q]
#    -q: quiet mode (do not print command, just exit w/ code 0 or 1)

set -euo pipefail

# parse flags
QUIET=false
while getopts ":q" opt; do
    case ${opt} in
        q ) QUIET=true ;;
        \? ) echo "Usage: $0 [-q]"
            exit 1
            ;;
    esac
done
shift $((OPTIND - 1))


# if GEMINI_CODE_SANDBOX is not set, try to source .env in case set there
if [ -z "${GEMINI_CODE_SANDBOX:-}" ] && [ -f .env ]; then source .env; fi

# if GEMINI_CODE_SANDBOX is still not set, then exit immediately w/ code 1
if [ -z "${GEMINI_CODE_SANDBOX:-}" ]; then exit 1; fi

# lowercase GEMINI_CODE_SANDBOX
GEMINI_CODE_SANDBOX=$(echo "${GEMINI_CODE_SANDBOX:-}" | tr '[:upper:]' '[:lower:]')

if [[ "${GEMINI_CODE_SANDBOX:-}" =~ ^(0|false)$ ]]; then
    exit 1
fi

# if GEMINI_CODE_SANDBOX is set to 1 or true, then try to use docker or podman
if [[ "${GEMINI_CODE_SANDBOX:-}" =~ ^(1|true)$ ]]; then
    if command -v docker &> /dev/null; then
        if [ "$QUIET" = false ]; then echo "docker"; fi
        exit 0
    elif command -v podman &> /dev/null; then
        if [ "$QUIET" = false ]; then echo "podman"; fi
        exit 0
    else
        echo "ERROR: install docker or podman or specify command in GEMINI_CODE_SANDBOX" >&2
        exit 1
    fi
fi

if ! command -v "$GEMINI_CODE_SANDBOX" &> /dev/null; then
    echo "ERROR: missing sandbox command '$GEMINI_CODE_SANDBOX' (from GEMINI_CODE_SANDBOX)" >&2
    exit 1
fi

if [ "$QUIET" = false ]; then echo "$GEMINI_CODE_SANDBOX"; fi
exit 0
