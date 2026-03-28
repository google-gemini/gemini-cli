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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const bunEnv = {
  ...process.env,
  BUN_TMPDIR: process.env.BUN_TMPDIR ?? '/tmp',
  TMPDIR: process.env.TMPDIR ?? '/tmp',
};

function pickPackageManager() {
  for (const candidate of ['bun', 'yarn', 'npm']) {
    try {
      execSync(`${candidate} --version`, { stdio: 'ignore' });
      return candidate;
    } catch {
      // Try the next available package manager.
    }
  }

  throw new Error('No supported package manager found');
}

const packageManager = pickPackageManager();
const run = (command) => `${packageManager} ${command}`;
const execOptions = { stdio: 'inherit', cwd: root, env: bunEnv };
const workspaceBuildOrder = new Map([
  ['@google/gemini-cli-devtools', 0],
  ['@google/gemini-cli-core', 1],
  ['@google/gemini-cli-test-utils', 2],
  ['@google/gemini-cli-sdk', 3],
  ['@google/gemini-cli-a2a-server', 4],
  ['@google/gemini-cli', 5],
]);

function getWorkspacePackageDirs() {
  const rootPackageJson = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf-8'),
  );
  const workspaceDirs = [];

  for (const workspace of rootPackageJson.workspaces ?? []) {
    const workspaceRoot = join(root, dirname(workspace));
    for (const entry of readdirSync(workspaceRoot)) {
      const pkgDir = join(workspaceRoot, entry);
      try {
        if (statSync(pkgDir).isDirectory()) {
          workspaceDirs.push(pkgDir);
        }
      } catch {
        // Ignore entries that disappear mid-scan.
      }
    }
  }

  return workspaceDirs;
}

function buildWorkspaces() {
  const packages = [];
  for (const pkgDir of getWorkspacePackageDirs()) {
    const pkgJsonPath = join(pkgDir, 'package.json');
    if (!existsSync(pkgJsonPath)) {
      continue;
    }

    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    if (!pkgJson.scripts?.build) {
      continue;
    }

    packages.push({ name: pkgJson.name, dir: pkgDir });
  }

  packages.sort((a, b) => {
    const aOrder = workspaceBuildOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = workspaceBuildOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.name.localeCompare(b.name);
  });

  for (const { dir: pkgDir } of packages) {
    execSync(run('run build'), {
      ...execOptions,
      cwd: pkgDir,
    });
  }
}

// Install dependencies if node_modules was removed (e.g. via scripts/clean.js).
if (!existsSync(join(root, 'node_modules'))) {
  execSync(run('install'), execOptions);
}

// build all workspaces/packages
execSync(run('run generate'), execOptions);
buildWorkspaces();

// also build container image if sandboxing is enabled
// skip (-s) package-manager install + build since we did that above
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
