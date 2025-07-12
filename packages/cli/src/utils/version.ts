/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-20
 */

import { getPackageJson } from './package.js';

export async function getCliVersion(): Promise<string> {
  const pkgJson = await getPackageJson();
  return process.env.CLI_VERSION || pkgJson?.version || 'unknown';
}
