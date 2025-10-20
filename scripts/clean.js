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

import { rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// remove npm install/build artifacts
rmSync(join(root, 'node_modules'), { recursive: true, force: true });
rmSync(join(root, 'bundle'), { recursive: true, force: true });
rmSync(join(root, 'packages/cli/src/generated/'), {
  recursive: true,
  force: true,
});
const RMRF_OPTIONS = { recursive: true, force: true };
rmSync(join(root, 'bundle'), RMRF_OPTIONS);
// Dynamically clean dist directories in all workspaces
const rootPackageJson = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf-8'),
);
for (const workspace of rootPackageJson.workspaces) {
  // Note: this is a simple glob implementation that only supports "packages/*".
  const workspaceDir = join(root, dirname(workspace));
  const packageDirs = readdirSync(workspaceDir);

  for (const pkg of packageDirs) {
    const pkgDir = join(workspaceDir, pkg);
    try {
      if (statSync(pkgDir).isDirectory()) {
        rmSync(join(pkgDir, 'dist'), RMRF_OPTIONS);
      }
    } catch (e) {
      if (e.code !== 'ENOENT') {
        throw e;
      }
    }
  }
}

// Clean up vscode-ide-companion package
rmSync(join(root, 'packages/vscode-ide-companion/node_modules'), {
  recursive: true,
  force: true,
});

const vscodeCompanionDir = join(root, 'packages/vscode-ide-companion');
try {
  const files = readdirSync(vscodeCompanionDir);
  for (const file of files) {
    if (file.endsWith('.vsix')) {
      rmSync(join(vscodeCompanionDir, file), RMRF_OPTIONS);
    }
  }
} catch (e) {
  if (e.code !== 'ENOENT') {
    throw e;
  }
}
