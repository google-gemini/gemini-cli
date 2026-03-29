/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

/**
 * Checks if a binary is available in the system PATH.
 */
export function isBinaryAvailable(binaryName: string): boolean {
  try {
    const command =
      process.platform === 'win32'
        ? `where ${binaryName}`
        : `which ${binaryName}`;
    execSync(command, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
