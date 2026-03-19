#!/bin/bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

# Ensure GH_TOKEN is set from memory-only mount if available
if [ -f /dev/shm/.gh_token ]; then
    export GH_TOKEN=$(cat /dev/shm/.gh_token)
    echo "GitHub token injected from memory."
fi

# Start shpool daemon in the background
/usr/local/bin/shpool daemon &

# Restore ~/.gemini settings if they are provided in a mount or PD
# (Assuming PD is mounted at /home/node/persistent_home for now)
if [ -d /home/node/persistent_home/.gemini ]; then
    rsync -a /home/node/persistent_home/.gemini/ /home/node/.gemini/
fi

# Execute the CMD passed to docker
exec "$@"
