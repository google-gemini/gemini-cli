/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdir, readdir, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const integrationTestsDir = join(rootDir, '.integration-tests');
let runDir = ''; // Make runDir accessible in teardown

export async function setup() {
  runDir = join(integrationTestsDir, `${Date.now()}`);
  await mkdir(runDir, { recursive: true });

  // Clean up old test runs, but keep the latest few for debugging
  try {
    const testRuns = await readdir(integrationTestsDir);
    if (testRuns.length > 5) {
      const oldRuns = testRuns.sort().slice(0, testRuns.length - 5);
      await Promise.all(
        oldRuns.map((oldRun) =>
          rm(join(integrationTestsDir, oldRun), {
            recursive: true,
            force: true,
          }),
        ),
      );
    }
  } catch (e) {
    console.error('Error cleaning up old test runs:', e);
  }

  process.env.INTEGRATION_TEST_FILE_DIR = runDir;
  process.env.GEMINI_CLI_INTEGRATION_TEST = 'true';
  process.env.TELEMETRY_LOG_FILE = join(runDir, 'telemetry.log');

  if (process.env.KEEP_OUTPUT) {
    console.log(`Keeping output for test run in: ${runDir}`);
  }
  process.env.VERBOSE = process.env.VERBOSE ?? 'false';

  console.log(`\nIntegration test output directory: ${runDir}`);
}

export async function teardown() {
  // Cleanup the test run directory unless KEEP_OUTPUT is set
  if (process.env.KEEP_OUTPUT !== 'true' && runDir) {
    await rm(runDir, { recursive: true, force: true });
  }
}
