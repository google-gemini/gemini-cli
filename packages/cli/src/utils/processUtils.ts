/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { runExitCleanup } from './cleanup.js';
import { waitForUpdateCompletion } from './handleAutoUpdate.js';

/**
 * Exit code used to signal that the CLI should be relaunched.
 */
export const RELAUNCH_EXIT_CODE = 199;

/**
 * Exits the process with a special code to signal that the parent process should relaunch it.
 */
let isRelaunching = false;

/** @internal only for testing */
export function _resetRelaunchStateForTesting(): void {
  isRelaunching = false;
}

export async function relaunchApp(sessionId?: string): Promise<void> {
  if (isRelaunching) return;
  isRelaunching = true;
  await waitForUpdateCompletion();
  await runExitCleanup();

  if (process.send && sessionId) {
    await new Promise<void>((resolve) => {
      process.send!(
        {
          type: 'relaunch-session',
          sessionId,
        },
        () => resolve(),
      );
    });
  }

  process.exit(RELAUNCH_EXIT_CODE);
}
