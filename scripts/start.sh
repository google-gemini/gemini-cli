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

# check build status, write warnings to file for app to display if needed
node ./scripts/check-build-status.js

# if GEMINI_CODE_SANDBOX is set (can be in .env file), start in sandbox container
if [[ "${GEMINI_CODE_SANDBOX:-}" =~ ^(1|true)$ ]] || \
   { [ -f .env ] && grep -qiE '^GEMINI_CODE_SANDBOX *= *(1|true)' .env; }; then
    echo "Running in sandbox container ..."
    scripts/start_sandbox.sh "$@"
else
    echo "WARNING: running outside of sandbox. Set GEMINI_CODE_SANDBOX to enable sandbox."
    if [ -n "${DEBUG:-}" ]; then
        node --inspect-brk node_modules/@gemini-code/cli "$@"
    else
        node node_modules/@gemini-code/cli "$@"
    fi
fi