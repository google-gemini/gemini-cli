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

# npm install if node_modules was removed (e.g. via npm run clean or scripts/clean.sh)
if [ ! -d "node_modules" ]; then
    npm install
fi

# build all workspaces/packages
npm run build --workspaces

# also build container image if GEMINI_CODE_SANDBOX is set (can be in .env file)
# skip (-s) npm install + build since we did that above
if [[ "${GEMINI_CODE_SANDBOX:-}" =~ ^(1|true)$ ]]; then
    scripts/build_sandbox.sh -s
elif [ -f .env ] && grep -qiE '^GEMINI_CODE_SANDBOX *= *(1|true)' .env; then
    scripts/build_sandbox.sh -s
fi
