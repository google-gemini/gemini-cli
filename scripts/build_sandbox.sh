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
echo "using $CMD for sandboxing"

IMAGE=gemini-code-sandbox
DOCKERFILE=Dockerfile

SKIP_NPM_INSTALL_BUILD=false
while getopts "sdf:" opt; do
    case ${opt} in
    s) SKIP_NPM_INSTALL_BUILD=true ;;
    d)
        DOCKERFILE=Dockerfile-dev
        IMAGE+="-dev"
        ;;
    f)
        DOCKERFILE=$OPTARG
        ;;
    \?)
        echo "usage: $(basename "$0") [-s] [-d] [-f <dockerfile>]"
        echo "  -s: skip npm install + npm run build"
        echo "  -d: build dev image (use Dockerfile-dev)"
        echo "  -f <dockerfile>: use <dockerfile>"
        exit 1
        ;;
    esac
done
shift $((OPTIND - 1))

# npm install + npm run build unless skipping via -s option
if [ "$SKIP_NPM_INSTALL_BUILD" = false ]; then
    npm install
    npm run build --workspaces
fi

# if using Dockerfile-dev, then skip rebuild unless BUILD_SANDBOX is set
# rebuild should not be necessary unless Dockerfile-dev is modified
if [ "$DOCKERFILE" = "Dockerfile-dev" ]; then
    if $CMD images -q "$IMAGE" | grep -q . && [ -z "${BUILD_SANDBOX:-}" ]; then
        echo "using existing $IMAGE (set BUILD_SANDBOX=true to force rebuild)"
        exit 0
    fi
fi

# prepare global installation files for prod build
if [ "$DOCKERFILE" = "Dockerfile" ]; then
    # pack cli
    echo "packing @gemini-code/cli ..."
    rm -f packages/cli/dist/gemini-code-cli-*.tgz
    npm pack -w @gemini-code/cli --pack-destination ./packages/cli/dist &>/dev/null
    # pack server
    echo "packing @gemini-code/server ..."
    rm -f packages/server/dist/gemini-code-server-*.tgz
    npm pack -w @gemini-code/server --pack-destination ./packages/server/dist &>/dev/null
    # give node user (used during installation, see Dockerfile) access to these files
    chmod 755 packages/*/dist/gemini-code-*.tgz
fi

# build container image & prune older unused images
echo "building $IMAGE ... (can be slow first time)"

if [[ "$CMD" == "podman" ]]; then
    # use empty --authfile to skip unnecessary auth refresh overhead
    $CMD build --authfile=<(echo '{}') -f "$DOCKERFILE" -t "$IMAGE" . >/dev/null
elif [[ "$CMD" == "docker" ]]; then
    # use an empty config directory to skip unnecessary auth refresh overhead
    $CMD --config="empty" build -f "$DOCKERFILE" -t "$IMAGE" . >/dev/null
else
    $CMD build -f "$DOCKERFILE" -t "$IMAGE" . >/dev/null
fi
$CMD image prune -f >/dev/null
echo "built $IMAGE"
