/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// A simplified version of detect-ide for use in the non-interactive CI test environment.
export function detectIdeInCi(): boolean {
  return !!process.env['TERM_PROGRAM'];
}
