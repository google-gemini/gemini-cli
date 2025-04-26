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

REGISTRY="us-west1-docker.pkg.dev/gemini-code-dev/gemini-code-containers" # TODO: swap this to public registry before launch
IMAGE="gemini-code"
TAG="0.1.0-fakeversion" # TODO: make this more configurable
PROJECT=$(basename "$PWD")
WORKDIR=/sandbox/$PROJECT

# use interactive tty mode and auto-remove container on exit
run_args=(-it --rm)

# mount current directory as $WORKDIR inside container
run_args+=(-v "$PWD:$WORKDIR")

# name container after image, plus numeric suffix to avoid conflicts
INDEX=0
while docker ps -a --format "{{.Names}}" | grep -q "$IMAGE-$INDEX"; do
    INDEX=$((INDEX + 1))
done
run_args+=(--name "$IMAGE-$INDEX" --hostname "$IMAGE-$INDEX")

# copy GEMINI_API_KEY
if [ -n "${GEMINI_API_KEY:-}" ]; then run_args+=(--env GEMINI_API_KEY="$GEMINI_API_KEY"); fi

# copy GEMINI_CODE_MODEL
if [ -n "${GEMINI_CODE_MODEL:-}" ]; then run_args+=(--env GEMINI_CODE_MODEL="$GEMINI_CODE_MODEL"); fi

# copy SHELL_TOOL to optionally enable shell tool
if [ -n "${SHELL_TOOL:-}" ]; then run_args+=(--env SHELL_TOOL="$SHELL_TOOL"); fi

# copy TERM and COLORTERM to try to maintain terminal setup
if [ -n "${TERM:-}" ]; then run_args+=(--env TERM="$TERM"); fi
if [ -n "${COLORTERM:-}" ]; then run_args+=(--env COLORTERM="$COLORTERM"); fi

# set SANDBOX environment variable as container name
# this is the preferred mechanism to detect if inside container/sandbox
run_args+=(--env "SANDBOX=$IMAGE:$TAG-$INDEX")

node_args=("$CLI_PATH" "$@")

docker run "${run_args[@]}" --init --workdir "$WORKDIR" "$REGISTRY/$IMAGE:$TAG" node "${node_args[@]}"