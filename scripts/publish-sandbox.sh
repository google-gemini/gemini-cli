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

# Ensure required environment variables are set
if [ -z "${SANDBOX_IMAGE_REGISTRY}" ]; then
  echo "Error: SANDBOX_IMAGE_REGISTRY environment variable is not set." >&2
  exit 1
fi

if [ -z "${SANDBOX_IMAGE_NAME}" ]; then
  echo "Error: SANDBOX_IMAGE_NAME environment variable is not set." >&2
  exit 1
fi

if [ -z "${npm_package_version}" ]; then
  echo "Error: npm_package_version environment variable is not set (should be run via npm)." >&2
  exit 1
fi

IMAGE_URI="${SANDBOX_IMAGE_REGISTRY}/${SANDBOX_IMAGE_NAME}:${npm_package_version}"

if [ -n "${DOCKER_DRY_RUN:-}" ]; then
  echo "DRY RUN: Would execute: docker push \"${IMAGE_URI}\""
else
  echo "Executing: docker push \"${IMAGE_URI}\""
  docker push "${IMAGE_URI}"
fi
