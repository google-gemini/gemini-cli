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

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const bundleDir = join(root, 'bundle');
const rootNodeModules = join(root, 'node_modules');
const bundleNodeModules = join(bundleDir, 'node_modules');

function copyRecursiveSync(src, dest) {
  const exists = existsSync(src);
  if (!exists) {
    return;
  }
  const stats = statSync(src);
  const isDirectory = stats.isDirectory();
  if (isDirectory) {
    mkdirSync(dest, { recursive: true });
    for (const childItemName of readdirSync(src)) {
      copyRecursiveSync(join(src, childItemName), join(dest, childItemName));
    }
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

// Create the bundle directory if it doesn't exist
if (!existsSync(bundleDir)) {
  mkdirSync(bundleDir);
}

// Find and copy all .sb files from packages to the root of the bundle directory
const sbFiles = glob.sync('packages/**/*.sb', { cwd: root });
for (const file of sbFiles) {
  copyFileSync(join(root, file), join(bundleDir, basename(file)));
}

// Copy node-pty dependencies
const nodePtyDeps = [
  'node-pty',
  ...glob.sync('@lydell/node-pty-*', { cwd: rootNodeModules }),
];

for (const dep of nodePtyDeps) {
  const src = join(rootNodeModules, dep);
  const dest = join(bundleNodeModules, dep);
  console.log(`Copying ${dep} to bundle/node_modules/`);
  copyRecursiveSync(src, dest);
}

console.log('Assets copied to bundle/');
