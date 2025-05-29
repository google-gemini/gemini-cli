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

# exit with warning if container-based sandboxing is disabled
# note this includes the case where sandbox-exec (seatbelt) is used
# this happens most commonly when user runs `npm run build:all` without enabling sandboxing
if ! scripts/sandbox_command.sh -q || [ "$(scripts/sandbox_command.sh)" == "sandbox-exec" ]; then
    echo "WARNING: container-based sandboxing is disabled (see README.md#sandboxing)"
    exit 0
fi

CMD=$(scripts/sandbox_command.sh)
echo "using $CMD for sandboxing"

IMAGE=gemini-code-sandbox:latest
DOCKERFILE=Dockerfile

SKIP_NPM_INSTALL_BUILD=false
while getopts "sf:" opt; do
    case ${opt} in
    s) SKIP_NPM_INSTALL_BUILD=true ;;
    f)
        DOCKERFILE=$OPTARG
        ;;
    \?)
        echo "usage: $(basename "$0") [-s] [-f <dockerfile>]"
        echo "  -s: skip npm install + npm run build"
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

# prepare global installation files for prod builds
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

# build container image & prune older unused images
echo "building $IMAGE ... (can be slow first time)"

# redirect build output to /dev/null unless VERBOSE is set
BUILD_STDOUT="/dev/null"
if [ -n "${VERBOSE:-}" ]; then
    BUILD_STDOUT="/dev/stdout"
fi

# initialize build arg array from BUILD_SANDBOX_FLAGS
read -r -a build_args <<<"${BUILD_SANDBOX_FLAGS:-}"

# append common build args
build_args+=(-f "$DOCKERFILE" -t "$IMAGE" .)

if [[ "$CMD" == "podman" ]]; then
    # use empty --authfile to skip unnecessary auth refresh overhead
    $CMD build --authfile=<(echo '{}') "${build_args[@]}" >$BUILD_STDOUT
elif [[ "$CMD" == "docker" ]]; then
    # use config directory to skip unnecessary auth refresh overhead
    $CMD --config=".docker" buildx build "${build_args[@]}" >$BUILD_STDOUT
else
    $CMD build "${build_args[@]}" >$BUILD_STDOUT
fi
$CMD image prune -f >/dev/null
echo "built $IMAGE"
