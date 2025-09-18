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

 * Relaunches the application by exiting with a special code.
 */
export function relaunchApp(): void {

  process.exit(RELAUNCH_EXIT_CODE);
}
