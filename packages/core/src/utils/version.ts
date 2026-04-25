/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPackageJson } from './package.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let versionPromise: Promise<string> | undefined;

/**
 * Resolves the current CLI version string.
 * Reads the version from `package.json` in the package directory, falling back
 * to the `CLI_VERSION` environment variable, then `'unknown'`.
 * The result is cached after the first call.
 * @returns A promise that resolves to the version string.
 */
export function getVersion(): Promise<string> {
  if (versionPromise) {
    return versionPromise;
  }
  versionPromise = (async () => {
    const pkgJson = await getPackageJson(__dirname);
    return process.env['CLI_VERSION'] || pkgJson?.version || 'unknown';
  })();
  return versionPromise;
}

/** For testing purposes only */
export function resetVersionCache(): void {
  versionPromise = undefined;
}
