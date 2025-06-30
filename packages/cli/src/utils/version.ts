/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPackageJson } from './package.js';

export async function getCliVersion(): Promise<string> {
  try {
    const pkgJson = await getPackageJson();
    return process.env.CLI_VERSION || pkgJson?.version || 'unknown';
  } catch (_error) {
    // If package loading fails, fall back to environment variable or 'unknown'
    return process.env.CLI_VERSION || 'unknown';
  }
}
