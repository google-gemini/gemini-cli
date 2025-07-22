/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPackageJson } from './package.js';

export async function getCliVersion(): Promise<string> {
  const pkgJson = await getPackageJson();
  const pkgJsonVersion = typeof pkgJson?.version === 'string' ? pkgJson.version : '';
  return process.env.CLI_VERSION || pkgJsonVersion || 'unknown';
}
