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

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function getWorkspaces() {
  const packagesDir = join(root, 'packages');
  const entries = readdirSync(packagesDir, { withFileTypes: true });
  const workspaces = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const pkgPath = join(packagesDir, entry.name, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
          if (pkg.name) {
            workspaces.push(pkg.name);
          }
        } catch {
          // skip
        }
      }
    }
  }
  return workspaces;
}

// npm install if node_modules was removed (e.g. via npm run clean or scripts/clean.js)
if (!existsSync(join(root, 'node_modules'))) {
  execSync('npm install', { stdio: 'inherit', cwd: root });
}

// build all workspaces/packages
execSync('npm run generate', { stdio: 'inherit', cwd: root });

if (process.env.CI) {
  console.log('CI environment detected. Building workspaces sequentially...');
  execSync('npm run build --workspaces', { stdio: 'inherit', cwd: root });
} else {
  // Build core first because everyone depends on it
  console.log('Building @google/gemini-cli-core...');
  execSync('npm run build -w @google/gemini-cli-core', {
    stdio: 'inherit',
    cwd: root,
  });

  // Build the rest in parallel
  console.log('Building other workspaces in parallel...');
  const parallelWorkspaces = getWorkspaces().filter(
    (name) => name !== '@google/gemini-cli-core',
  );

  execSync(
    `npx npm-run-all --parallel ${parallelWorkspaces.map((w) => `"build -w ${w}"`).join(' ')}`,
    { stdio: 'inherit', cwd: root },
  );
}

// also build container image if sandboxing is enabled
// skip (-s) npm install + build since we did that above
try {
  execSync('node scripts/sandbox_command.js -q', {
    stdio: 'inherit',
    cwd: root,
  });
  if (
    process.env.BUILD_SANDBOX === '1' ||
    process.env.BUILD_SANDBOX === 'true'
  ) {
    execSync('node scripts/build_sandbox.js -s', {
      stdio: 'inherit',
      cwd: root,
    });
  }
} catch {
  // ignore
}
