/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import path from 'node:path';

const type = process.argv[2]; // 'perf' or 'memory'
const args = process.argv.slice(3);

if (type !== 'perf' && type !== 'memory') {
  console.error('Invalid test type. Must be "perf" or "memory".');
  process.exit(1);
}

const isLocal = !process.env.CI && !process.env.GITHUB_ACTIONS;
const noOptions = args.length === 0;
const testDir = type === 'perf' ? './perf-tests' : './memory-tests';
const updateEnv =
  type === 'perf'
    ? 'UPDATE_PERF_BASELINES=true'
    : 'UPDATE_MEMORY_BASELINES=true';
const tempBaselinesPath = path.resolve(
  process.cwd(),
  `.tmp-${type}-baselines.json`,
);

if (isLocal && noOptions) {
  console.log(
    `[Auto-Baseline] Detected local run without options for ${type} tests.`,
  );
  console.log('[Auto-Baseline] Updating baselines from main branch first...');

  let originalBranch = '';
  let isDirty = false;

  try {
    originalBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
    }).trim();
    const status = execSync('git status --porcelain', {
      encoding: 'utf-8',
    }).trim();
    isDirty = status !== '';

    if (isDirty) {
      console.log('[Auto-Baseline] Stashing current changes...');
      execSync('git stash push --include-untracked -m "temp-perf-test-run"');
    }

    console.log('[Auto-Baseline] Switching to main branch...');
    execSync('git checkout main', { stdio: 'inherit' });

    try {
      console.log(
        '[Auto-Baseline] Pulling latest changes for main from origin...',
      );
      execSync('git pull origin main', { stdio: 'inherit' });
    } catch {
      console.warn(
        '[Auto-Baseline] Warning: git pull failed. Proceeding with local main branch.',
      );
    }

    console.log(
      `[Auto-Baseline] Running update baselines for ${type} tests on main...`,
    );
    execSync(
      `npx cross-env ${updateEnv} TEMP_BASELINES_PATH=${tempBaselinesPath} npx vitest run --root ${testDir}`,
      { stdio: 'inherit' },
    );
  } catch (err) {
    console.error(
      '[Auto-Baseline] Error during main-branch baseline update:',
      err,
    );
  } finally {
    if (originalBranch) {
      console.log(
        `[Auto-Baseline] Returning to original branch: ${originalBranch}...`,
      );
      try {
        execSync(`git checkout ${originalBranch}`, { stdio: 'inherit' });
        if (isDirty) {
          console.log('[Auto-Baseline] Restoring stashed changes...');
          execSync('git stash pop', { stdio: 'inherit' });
        }
      } catch {
        console.error(
          '[Auto-Baseline] Critical error while trying to restore original branch state.',
        );
      }
    }
  }

  console.log(
    `[Auto-Baseline] Running tests on branch ${originalBranch} against updated baselines...`,
  );
  try {
    execSync(
      `npx cross-env TEMP_BASELINES_PATH=${tempBaselinesPath} npx vitest run --root ${testDir}`,
      { stdio: 'inherit' },
    );
  } catch {
    process.exit(1);
  }
} else {
  // Just run standard tests directly
  const command = `npx vitest run --root ${testDir} ${args.join(' ')}`;
  console.log(`[Standard] Running tests: ${command}`);
  try {
    execSync(command, { stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
}
