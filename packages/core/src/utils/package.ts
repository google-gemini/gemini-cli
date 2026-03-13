/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  readPackageUp,
  type PackageJson as BasePackageJson,
} from 'read-package-up';
import { debugLogger } from './debugLogger.js';

export type PackageJson = BasePackageJson & {
  config?: {
    sandboxImageUri?: string;
  };
};

const packageJsonCache = new Map<string, PackageJson | undefined>();

/**
 * Reads package.json from the current directory or any parent directory.
 *
 * @param cwd - The directory to start searching from (searches upward to filesystem root)
 * @returns The package.json object if found, or `undefined` if no package.json exists
 *          in the directory hierarchy. This is expected behavior when called from
 *          directories outside of a Node.js project.
 *
 * @example
 * ```ts
 * const pkg = await getPackageJson(__dirname);
 * const version = pkg?.version ?? 'unknown';
 * ```
 */
export async function getPackageJson(
  cwd: string,
): Promise<PackageJson | undefined> {
  if (packageJsonCache.has(cwd)) {
    return packageJsonCache.get(cwd);
  }

  try {
    const result = await readPackageUp({ cwd, normalize: false });
    const pkg = result?.packageJson;
    packageJsonCache.set(cwd, pkg);
    return pkg;
  } catch (error) {
    debugLogger.error('Error occurred while reading package.json', error);
    return undefined;
  }
}

/**
 * Clears the package.json cache.
 * Useful for testing.
 */
export function clearPackageJsonCache(): void {
  packageJsonCache.clear();
}
