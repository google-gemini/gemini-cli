/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execPromise = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// npm install if node_modules was removed (e.g. via npm run clean or scripts/clean.js)
if (!existsSync(join(root, 'node_modules'))) {
  execSync('npm install', { stdio: 'inherit', cwd: root });
}

const workspaces = [
  '@google/gemini-cli-test-utils',
  '@google/gemini-cli-core',
  '@google/gemini-cli',
  'gemini-cli-vscode-ide-companion',
];

async function buildWorkspace(workspace) {
  console.log(`Building ${workspace}...`);
  try {
    const { stdout, stderr } = await execPromise(
      `npm run build --workspace ${workspace}`,
      { cwd: root },
    );
    console.log(`Successfully built ${workspace}`);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (error) {
    console.error(`Failed to build ${workspace}:`);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
}

async function main() {
  // build all workspaces/packages
  execSync('npm run generate', { stdio: 'inherit', cwd: root });

  console.log('Building workspaces in parallel...');
  await Promise.all(workspaces.map(buildWorkspace));

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
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
