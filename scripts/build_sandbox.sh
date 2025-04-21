#!/bin/bash
set -euo pipefail

IMAGE=gemini-code-sandbox

SKIP_NPM_INSTALL_BUILD=false
while getopts "s" opt; do
    case ${opt} in
        s) SKIP_NPM_INSTALL_BUILD=true ;;
        \?)
            echo "usage: $(basename "$0") [-s]"
            echo "  -s: skip npm install + npm run build"
            exit 1
            ;;
    esac
done
shift $((OPTIND - 1))

# use docker if installed, otherwise try to use podman instead
if command -v docker &> /dev/null; then
    CMD=docker
elif command -v podman &> /dev/null; then
    CMD=podman
else
    echo "ERROR: missing docker or podman for sandboxing"
    exit 1
fi
echo "using $CMD for sandboxing"

# npm install + npm run build unless skipping via -s option
if [ "$SKIP_NPM_INSTALL_BUILD" = false ]; then
    npm install
    npm run build
fi

# pack cli
echo "packing @gemini-code/cli ..."
rm -f packages/cli/dist/gemini-code-cli-*.tgz
npm pack -w @gemini-code/cli --pack-destination ./packages/cli/dist &> /dev/null

# pack server
echo "packing @gemini-code/server ..."
rm -f packages/server/dist/gemini-code-server-*.tgz
npm pack -w @gemini-code/server --pack-destination ./packages/server/dist &> /dev/null

# build container image & prune older unused images
# use empty --authfile to skip unnecessary auth refresh overhead
echo "building $IMAGE ... (can be slow first time)"
$CMD build --authfile <(echo '{}') -t "$IMAGE" . >/dev/null
$CMD image prune -f
echo "built $IMAGE"