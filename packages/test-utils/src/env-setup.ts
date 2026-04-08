/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'node:path';

/**
 * Isolate the test environment by setting environment variables
 * to point to a temporary run directory.
 *
 * @param runDir - The temporary directory for this test run.
 */
export function isolateTestEnv(runDir: string): void {
  // Set the home directory to the test run directory to avoid conflicts
  // with the user's local config.
  process.env['HOME'] = runDir;
  if (process.platform === 'win32') {
    process.env['USERPROFILE'] = runDir;
  }

  // We also need to set the config dir explicitly, since the code might
  // construct the path before the HOME env var is set.
  process.env['GEMINI_CONFIG_DIR'] = join(runDir, '.gemini');

  // Force file storage to avoid keychain prompts/hangs in CI, especially on macOS
  process.env['GEMINI_FORCE_FILE_STORAGE'] = 'true';

  // Mark as integration test
  process.env['GEMINI_CLI_INTEGRATION_TEST'] = 'true';

  // Isolate telemetry log
  process.env['TELEMETRY_LOG_FILE'] = join(runDir, 'telemetry.log');
}
