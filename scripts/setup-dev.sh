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

# Check if npm is installed
if ! command -v npm &> /dev/null
then
    echo "npm not found. Installing npm via nvm..."
    # Download and install nvm:
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    # in lieu of restarting the shell
    \. "$HOME/.nvm/nvm.sh"
    # Download and install Node.js:
    nvm install 22
    # Verify the Node.js version:
    node -v # Should print "v22.15.0".
    nvm current # Should print "v22.15.0".
    # Verify npm version:
    npm -v # Should print "10.9.2".
fi

# Check if jq is installed
if ! command -v jq &> /dev/null
then
    echo "jq not found. Installing jq..."
    # This assumes a Debian/Ubuntu based system. Adjust for other distributions.
    sudo apt-get update
    sudo apt-get install -y jq
fi

echo "Development environment setup complete."
