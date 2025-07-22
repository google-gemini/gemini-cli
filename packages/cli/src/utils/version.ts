/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPackageJson } from './package.js';

export async function getCliVersion(): Promise<string> {
  const pkgJson = await getPackageJson();
  const pkgJsonVersion = pkgJson?.version ? String(pkgJson.version) : undefined;
  return process.env.CLI_VERSION || pkgJsonVersion || 'unknown';
}
