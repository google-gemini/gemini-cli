/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env.NO_COLOR !== undefined) {
  delete process.env.NO_COLOR;
}

import {
  mkdir,
  readdir,
  rm,
  readFile,
  writeFile,
  unlink,
} from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as os from 'node:os';

import {
  GEMINI_CONFIG_DIR,
  DEFAULT_CONTEXT_FILENAME,
} from '../packages/core/src/tools/memoryTool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const integrationTestsDir = join(rootDir, '.integration-tests');
let runDir = ''; // Make runDir accessible in teardown

const memoryFilePath = join(
  os.homedir(),
  GEMINI_CONFIG_DIR,
  DEFAULT_CONTEXT_FILENAME,
);
let originalMemoryContent: string | null = null;

export async function setup() {
  try {
    originalMemoryContent = await readFile(memoryFilePath, 'utf-8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw e;
    }
    // File doesn't exist, which is fine.
  }

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

  if (originalMemoryContent !== null) {
    await mkdir(dirname(memoryFilePath), { recursive: true });
    await writeFile(memoryFilePath, originalMemoryContent, 'utf-8');
  } else {
    try {
      await unlink(memoryFilePath);
    } catch {
      // File might not exist if the test failed before creating it.
    }
  }
}
