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

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const bundleDir = process.env.TEST_BUNDLE_DIR || join(root, 'bundle');

// Create the bundle directory if it doesn't exist
if (!existsSync(bundleDir)) {
  mkdirSync(bundleDir);
}

// Find and copy all .sb files from packages to the root of the bundle directory
const sbFiles = glob.sync('packages/**/*.sb', { cwd: root });
for (const file of sbFiles) {
  const destPath = join(bundleDir, basename(file));
  copyFileSync(join(root, file), destPath);
}

// Create backwards compatibility symlinks for renamed seatbelt profiles
// This fixes issue #850 where npx installs look for the old profile names
const profileMappings = [
  { old: 'sandbox-macos-minimal.sb', new: 'sandbox-macos-permissive-open.sb' },
  {
    old: 'sandbox-macos-strict.sb',
    new: 'sandbox-macos-restrictive-closed.sb',
  },
];

for (const mapping of profileMappings) {
  const newPath = join(bundleDir, mapping.new);
  const oldPath = join(bundleDir, mapping.old);

  // Only create symlink if the new file exists and old doesn't
  if (existsSync(newPath) && !existsSync(oldPath)) {
    // Copy file instead of symlink for better compatibility with npm packaging
    copyFileSync(newPath, oldPath);
    console.log(`Created compatibility copy: ${mapping.old} -> ${mapping.new}`);
  }
}

console.log('Assets copied to bundle/');
