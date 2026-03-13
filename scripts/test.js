/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const isBun = typeof process.versions.bun !== 'undefined';
const pm = isBun ? 'bun' : 'npm';

const args = process.argv.slice(2);
const isCi = args.includes('--ci');

// Remove --ci from args if present
const filteredArgs = args.filter(arg => arg !== '--ci');

const runTest = (command, extraArgs = []) => {
  let fullCommand;

  if (isBun) {
    // Bun: bun run [-F <pkg>] <script> [args]
    const bunArgs = [];
    const scriptArgs = [];
    
    let i = 0;
    while (i < filteredArgs.length) {
      if ((filteredArgs[i] === '--filter' || filteredArgs[i] === '-F') && i + 1 < filteredArgs.length) {
        bunArgs.push('-F', filteredArgs[i+1]);
        i += 2;
      } else if (filteredArgs[i].startsWith('--filter=')) {
        bunArgs.push('-F', filteredArgs[i].split('=')[1]);
        i++;
      } else {
        scriptArgs.push(filteredArgs[i]);
        i++;
      }
    }
    
    let j = 0;
    while (j < extraArgs.length) {
      if ((extraArgs[j] === '--filter' || extraArgs[j] === '-F') && j + 1 < extraArgs.length) {
        bunArgs.push('-F', extraArgs[j+1]);
        j += 2;
      } else if (extraArgs[j].startsWith('--filter=')) {
        bunArgs.push('-F', extraArgs[j].split('=')[1]);
        j++;
      } else {
        scriptArgs.push(extraArgs[j]);
        j++;
      }
    }

    fullCommand = `bun run ${bunArgs.join(' ')} ${command} ${scriptArgs.join(' ')}`.trim();
  } else {
    // NPM: npm run <script> [-- [args]]
    const separator = filteredArgs.length > 0 || extraArgs.length > 0 ? '--' : '';
    fullCommand = `npm run ${command} ${separator} ${extraArgs.join(' ')} ${filteredArgs.join(' ')}`.trim();
  }

  console.log(`Running: ${fullCommand}`);
  try {
    execSync(fullCommand, { 
      stdio: 'inherit', 
      cwd: root,
    });
  } catch (error) {
    throw error;
  }
};

// Check if we are being called from a workspace or with a specific filter
const hasFilter = args.some(arg => arg.includes('--filter') || arg.includes('-F') || arg.includes('--workspace') || arg.includes('-w'));

try {
  if (isCi) {
    // Equivalent to test:ci
    if (!hasFilter) {
      if (isBun) {
        runTest('test:vitest', ['-F', "'*'"]);
      } else {
        runTest('test', ['--workspaces', '--if-present']);
      }
    } else {
      runTest('test:vitest');
    }
    runTest('test:scripts');
    runTest('test:sea-launch');
  } else {
    // Equivalent to test
    if (!hasFilter) {
      if (isBun) {
        runTest('test:vitest', ['-F', "'*'"]);
      } else {
        runTest('test', ['--workspaces', '--if-present']);
      }
    } else {
      runTest('test:vitest');
    }
    runTest('test:sea-launch');
  }
} catch (error) {
  process.exit(1);
}
