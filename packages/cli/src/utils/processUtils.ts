/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { runExitCleanup } from './cleanup.js';

/**
 * Exit code used to signal that the CLI should be relaunched.
 */
export const RELAUNCH_EXIT_CODE = 42;

/**
 * Exits the process with a special code to signal that the parent process should relaunch it.
 */
export async function relaunchApp(): Promise<void> {
  await runExitCleanup();
  process.exit(RELAUNCH_EXIT_CODE);
}
