/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  readPackageUp,
  type PackageJson as BasePackageJson,
} from 'read-package-up';

export type PackageJson = BasePackageJson & {
  config?: {
    sandboxImageUri?: string;
  };
};

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
  const result = await readPackageUp({ cwd });
  if (!result) {
    return undefined;
  }

  return result.packageJson;
}
