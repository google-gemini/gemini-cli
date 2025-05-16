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

if [[ $(pwd) != *"/packages/"* ]]; then
    echo "must be invoked from a package directory"
    exit 1
fi

# clean dist directory
# rm -rf dist/*

# build typescript files
tsc --build

# copy .{md,json} files
node ../../scripts/copy_files.js

# touch dist/.last_build
touch dist/.last_build
