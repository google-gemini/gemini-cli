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

export function getVersion(): Promise<string> {
  if (versionPromise) {
    return versionPromise;
  }
  versionPromise = (async () => {
    if (process.env['CLI_VERSION']) {
      return process.env['CLI_VERSION'];
    }

    let currentDir = __dirname;
    let bestVersion = 'unknown';

    // Traverse up to find the most relevant package.json.
    // In a monorepo/source build, we want to prefer the root version if available.
    while (currentDir !== path.parse(currentDir).root) {
      const pkgJson = await getPackageJson(currentDir);
      if (pkgJson?.version) {
        bestVersion = pkgJson.version;
        // If we found the root or the CLI package, we can stop.
        if (
          pkgJson.name === '@google/gemini-cli' ||
          pkgJson.name === 'gemini-cli'
        ) {
          break;
        }
      }
      currentDir = path.dirname(currentDir);
    }

    return bestVersion;
  })();
  return versionPromise;
}

/** For testing purposes only */
export function resetVersionCache(): void {
  versionPromise = undefined;
}
