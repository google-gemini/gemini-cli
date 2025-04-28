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

# if sandboxing is enabled, start in sandbox container
if scripts/sandbox_command.sh -q; then
    scripts/start_sandbox.sh "$@"
else
    echo "WARNING: OUTSIDE SANDBOX. See README.md to enable sandboxing."
    # DEV=true to enable React Dev Tools (https://github.com/vadimdemedes/ink?tab=readme-ov-file#using-react-devtools)
    # CLI_VERSION to display in the app ui footer
    if [ -n "${DEBUG:-}" ]; then
        CLI_VERSION='development' DEV=true npm run debug --workspace=@gemini-code/cli -- "$@"
    else
        CLI_VERSION='development' DEV=true npm run start --workspace=@gemini-code/cli -- "$@"
    fi
fi