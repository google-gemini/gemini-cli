/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let versionPromise: Promise<string> | undefined;

type VersionPackageJson = {
  name?: string;
  version?: string;
};

async function readPackageJsonAtDir(
  dir: string,
): Promise<VersionPackageJson | undefined> {
  try {
    const packageJsonPath = path.join(dir, 'package.json');
    const packageJsonText = await readFile(packageJsonPath, 'utf8');
    const parsedPackageJson: unknown = JSON.parse(packageJsonText);
    if (!parsedPackageJson || typeof parsedPackageJson !== 'object') {
      return undefined;
    }

    const name =
      'name' in parsedPackageJson ? parsedPackageJson.name : undefined;
    const version =
      'version' in parsedPackageJson ? parsedPackageJson.version : undefined;
    return {
      name: typeof name === 'string' ? name : undefined,
      version: typeof version === 'string' ? version : undefined,
    };
  } catch {
    return undefined;
  }
}

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

    while (true) {
      const pkgJson = await readPackageJsonAtDir(currentDir);
      if (pkgJson?.version) {
        bestVersion = pkgJson.version;
        if (
          pkgJson.name === '@google/gemini-cli' ||
          pkgJson.name === 'gemini-cli'
        ) {
          break;
        }
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }

    return bestVersion;
  })();
  return versionPromise;
}

/** For testing purposes only */
export function resetVersionCache(): void {
  versionPromise = undefined;
}
