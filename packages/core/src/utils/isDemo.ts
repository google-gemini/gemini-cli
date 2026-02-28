/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function isDemo(): boolean {
  const val = process.env['IS_DEMO'];
  return val === '1' || val?.toLowerCase() === 'true';
}
