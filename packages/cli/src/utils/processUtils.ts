/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { runExitCleanup } from './cleanup.js';
import {
  isUpdateInProgress,
  waitForUpdateCompletion,
} from './updateEventEmitter.js';

/**
 * Exit code used to signal that the CLI should be relaunched.
 */
export const RELAUNCH_EXIT_CODE = 199;

/**
 * Exits the process with a special code to signal that the parent process should relaunch it.
 *
 * If a background auto-update is in progress, waits for it to finish (or a
 * timeout to expire) before exiting. This prevents the relaunch from racing
 * with a partially-installed update, which would cause ENOENT crashes on
 * Windows (see https://github.com/google-gemini/gemini-cli/issues/20127).
 */
export async function relaunchApp(): Promise<void> {
  if (isUpdateInProgress()) {
    await waitForUpdateCompletion();
  }
  await runExitCleanup();
  process.exit(RELAUNCH_EXIT_CODE);
}
