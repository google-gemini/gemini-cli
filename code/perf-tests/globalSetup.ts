/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdir, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canUseRipgrep } from '../packages/core/src/tools/ripGrep.js';
import { isolateTestEnv } from '../packages/test-utils/src/env-setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const perfTestsDir = join(rootDir, '.perf-tests');
const KEEP_RUNS_COUNT = 5;
let runDir = '';

export async function setup() {
  runDir = join(perfTestsDir, `${Date.now()}`);
  await mkdir(runDir, { recursive: true });

  // Isolate environment variables
  isolateTestEnv(runDir);

  // Download ripgrep to avoid race conditions
  const available = await canUseRipgrep();
  if (!available) {
    throw new Error('Failed to download ripgrep binary');
  }

  // Clean up old test runs, keeping the latest few for debugging
  try {
    const testRuns = await readdir(perfTestsDir);
    if (testRuns.length > KEEP_RUNS_COUNT) {
      const oldRuns = testRuns
        .sort()
        .slice(0, testRuns.length - KEEP_RUNS_COUNT);
      await Promise.all(
        oldRuns.map((oldRun) =>
          rm(join(perfTestsDir, oldRun), {
            recursive: true,
            force: true,
          }),
        ),
      );
    }
  } catch (e) {
    console.error('Error cleaning up old perf test runs:', e);
  }

  process.env['INTEGRATION_TEST_FILE_DIR'] = runDir;
  process.env['VERBOSE'] = process.env['VERBOSE'] ?? 'false';

  console.log(`\nPerf test output directory: ${runDir}`);
}

export async function teardown() {
  // Cleanup unless KEEP_OUTPUT is set
  if (process.env['KEEP_OUTPUT'] !== 'true' && runDir) {
    try {
      await rm(runDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to clean up perf test directory:', e);
    }
  }
}
