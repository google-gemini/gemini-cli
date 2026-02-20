/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getActiveUpdatePromise } from './handleAutoUpdate.js';
import { runExitCleanup } from './cleanup.js';

/**
 * Exit code used to signal that the CLI should be relaunched.
 */
export const RELAUNCH_EXIT_CODE = 199;

/**
 * Exits the process with a special code to signal that the parent process should relaunch it.
 *
 * If an auto-update is currently in progress, this function waits for the update to complete
 * before running exit cleanup and exiting with {@link RELAUNCH_EXIT_CODE}. This can introduce
 * a delay between calling this function and the process actually exiting and being relaunched.
 */
export async function relaunchApp(): Promise<void> {
  const updatePromise = getActiveUpdatePromise();
  if (updatePromise) {
    await updatePromise;
  }
  await runExitCleanup();
  process.exit(RELAUNCH_EXIT_CODE);
}
