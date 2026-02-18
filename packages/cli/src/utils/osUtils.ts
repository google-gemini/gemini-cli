/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';

/**
 * Retrieves the current user's username with fallbacks for different environments.
 *
 * @returns The username string, falling back to environment variables or 'User'.
 */
export function getUsername(): string {
  try {
    return os.userInfo().username;
  } catch {
    return process.env['USER'] || process.env['USERNAME'] || 'User';
  }
}
