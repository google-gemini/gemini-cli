/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AdminControlsSettings } from '@google/gemini-cli-core';
import { runExitCleanup } from './cleanup.js';
import { waitForUpdateCompletion } from './handleAutoUpdate.js';

/**
 * Exit code used to signal that the CLI should be relaunched.
 */
export const RELAUNCH_EXIT_CODE = 199;

/**
 * Restarts the CLI, either by signaling an existing parent wrapper or by
 * spawning one on demand.
 */
let isRelaunching = false;

/** @internal only for testing */
export function _resetRelaunchStateForTesting(): void {
  isRelaunching = false;
}

export async function relaunchApp(
  remoteAdminSettings?: AdminControlsSettings,
): Promise<void> {
  if (isRelaunching) return;
  isRelaunching = true;
  await waitForUpdateCompletion();
  await runExitCleanup();

  if (process.send || process.env['SANDBOX']) {
    if (process.send && remoteAdminSettings) {
      process.send({
        type: 'admin-settings-update',
        settings: remoteAdminSettings,
      });
    }
    process.exit(RELAUNCH_EXIT_CODE);
  }

  const { relaunchAppInChildProcess } = await import('./relaunch.js');
  await relaunchAppInChildProcess([], [], remoteAdminSettings);
}
