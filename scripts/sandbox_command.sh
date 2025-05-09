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
    q) QUIET=true ;;
    \?)
        echo "Usage: $0 [-q]"
        exit 1
        ;;
    esac
done
shift $((OPTIND - 1))

# if GEMINI_CODE_SANDBOX is not set, see if it is set in user settings
# note it can be string or boolean, and if missing jq will return null
USER_SETTINGS_FILE=~/.gemini/settings.json
if [ -z "${GEMINI_CODE_SANDBOX:-}" ] && [ -f "$USER_SETTINGS_FILE" ]; then
    USER_SANDBOX_SETTING=$(jq -r '.sandbox' "$USER_SETTINGS_FILE")
    if [ "$USER_SANDBOX_SETTING" != null ]; then
        GEMINI_CODE_SANDBOX=$USER_SANDBOX_SETTING
    fi
fi

# if GEMINI_CODE_SANDBOX is not set, try to source .env in case set there
# allow .env to be in any ancestor directory (same as findEnvFile in config.ts)
if [ -z "${GEMINI_CODE_SANDBOX:-}" ]; then
    current_dir=$(pwd)
    while [ "$current_dir" != "/" ]; do
        if [ -f "$current_dir/.env" ]; then
            source "$current_dir/.env"
            break
        fi
        current_dir=$(dirname "$current_dir")
    done
fi

# lowercase GEMINI_CODE_SANDBOX
GEMINI_CODE_SANDBOX=$(echo "${GEMINI_CODE_SANDBOX:-}" | tr '[:upper:]' '[:lower:]')

# if GEMINI_CODE_SANDBOX is set to 1|true, then try to use docker or podman
# if non-empty and not 0|false, treat as custom command and check that it exists
# if empty or 0|false, then fail silently (after checking for possible fallbacks)
command=""
if [[ "${GEMINI_CODE_SANDBOX:-}" =~ ^(1|true)$ ]]; then
    if command -v docker &>/dev/null; then
        command="docker"
    elif command -v podman &>/dev/null; then
        command="podman"
    else
        echo "ERROR: install docker or podman or specify command in GEMINI_CODE_SANDBOX" >&2
        exit 1
    fi
elif [ -n "${GEMINI_CODE_SANDBOX:-}" ] && [[ ! "${GEMINI_CODE_SANDBOX:-}" =~ ^(0|false)$ ]]; then
    if ! command -v "$GEMINI_CODE_SANDBOX" &>/dev/null; then
        echo "ERROR: missing sandbox command '$GEMINI_CODE_SANDBOX' (from GEMINI_CODE_SANDBOX)" >&2
        exit 1
    fi
    command="$GEMINI_CODE_SANDBOX"
else
    # if we are on macOS and sandbox-exec is available, use that for minimal sandboxing
    # unless SEATBELT_PROFILE is set to 'none', which we allow as an escape hatch
    if [ "$(uname)" = "Darwin" ] && command -v sandbox-exec &>/dev/null && [ "${SEATBELT_PROFILE:-}" != "none" ]; then
        command="sandbox-exec"
    else # GEMINI_CODE_SANDBOX is empty or 0|false, so we fail w/o error msg
        exit 1
    fi
fi

if [ "$QUIET" = false ]; then echo "$command"; fi
exit 0
