/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdir, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canUseRipgrep } from '../packages/core/src/tools/ripGrep.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const memoryTestsDir = join(rootDir, '.memory-tests');
let runDir = '';

export async function setup() {
  runDir = join(memoryTestsDir, `${Date.now()}`);
  await mkdir(runDir, { recursive: true });

  // Set the home directory to the test run directory to avoid conflicts
  // with the user's local config.
  process.env['HOME'] = runDir;
  if (process.platform === 'win32') {
    process.env['USERPROFILE'] = runDir;
  }
  process.env['GEMINI_CONFIG_DIR'] = join(runDir, '.gemini');

  // Download ripgrep to avoid race conditions
  const available = await canUseRipgrep();
  if (!available) {
    throw new Error('Failed to download ripgrep binary');
  }

  // Clean up old test runs, keeping the latest few for debugging
  try {
    const testRuns = await readdir(memoryTestsDir);
    if (testRuns.length > 3) {
      const oldRuns = testRuns.sort().slice(0, testRuns.length - 3);
      await Promise.all(
        oldRuns.map((oldRun) =>
          rm(join(memoryTestsDir, oldRun), {
            recursive: true,
            force: true,
          }),
        ),
      );
    }
  } catch (e) {
    console.error('Error cleaning up old memory test runs:', e);
  }

  process.env['INTEGRATION_TEST_FILE_DIR'] = runDir;
  process.env['GEMINI_CLI_INTEGRATION_TEST'] = 'true';
  process.env['GEMINI_FORCE_FILE_STORAGE'] = 'true';
  process.env['TELEMETRY_LOG_FILE'] = join(runDir, 'telemetry.log');
  process.env['VERBOSE'] = process.env['VERBOSE'] ?? 'false';

  console.log(`\nMemory test output directory: ${runDir}`);
}

export async function teardown() {
  // Cleanup unless KEEP_OUTPUT is set
  if (process.env['KEEP_OUTPUT'] !== 'true' && runDir) {
    try {
      await rm(runDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to clean up memory test directory:', e);
    }
  }
}
