/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { execSync } from 'child_process';

const {
  npm_package_config_sandboxImageUri,
  DOCKER_DRY_RUN,
  GEMINI_SANDBOX_IMAGE_TAG,
} = process.env;

if (!npm_package_config_sandboxImageUri) {
  console.error(
    'Error: npm_package_config_sandboxImageUri environment variable is not set (should be run via npm).',
  );
  process.exit(1);
}

let imageUri = npm_package_config_sandboxImageUri;

if (GEMINI_SANDBOX_IMAGE_TAG) {
  const [baseUri] = imageUri.split(':');
  imageUri = `${baseUri}:${GEMINI_SANDBOX_IMAGE_TAG}`;
}

if (DOCKER_DRY_RUN) {
  console.log(`DRY RUN: Would execute: docker push "${imageUri}"`);
} else {
  console.log(`Executing: docker push "${imageUri}"`);
  execSync(`docker push "${imageUri}"`, { stdio: 'inherit' });
}
