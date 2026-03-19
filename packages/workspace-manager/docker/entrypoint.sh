#!/bin/bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -e

# Ensure GH_TOKEN is set from memory-only mount if available
if [ -f /dev/shm/.gh_token ]; then
    export GH_TOKEN=$(cat /dev/shm/.gh_token)
    echo "GitHub token injected from memory."
fi

# Start shpool daemon in the background and verify it stays up
/usr/local/bin/shpool daemon &
SHPOOL_PID=$!

sleep 2
if ! kill -0 $SHPOOL_PID 2>/dev/null; then
    echo "Error: shpool daemon failed to start"
    exit 1
fi

echo "shpool daemon started successfully (PID: $SHPOOL_PID)"

# Restore ~/.gemini settings if they are provided in a mount or PD
# (Assuming PD is mounted at /home/node/persistent_home for now)
if [ -d /home/node/persistent_home/.gemini ]; then
    rsync -a /home/node/persistent_home/.gemini/ /home/node/.gemini/
fi

# Execute the CMD passed to docker
exec "$@"
