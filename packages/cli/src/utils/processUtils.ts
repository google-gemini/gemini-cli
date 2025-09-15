/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Process utilities for CLI restart functionality
 */

/**
 * Exit code used to signal that the CLI should be relaunched
 */
export const RELAUNCH_EXIT_CODE = 42;

/**
 * Exits the current process with the relaunch exit code
 * This signals to the parent process that it should restart the CLI
 */
export function relaunchApp(): void {
  process.exit(RELAUNCH_EXIT_CODE);
}
