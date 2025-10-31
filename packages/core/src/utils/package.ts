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

export async function getPackageJson(
  cwd: string,
): Promise<PackageJson | undefined> {
  const result = await readPackageUp({ cwd });
  if (!result) {
    // TODO: Maybe bubble this up as an error.
    return;
  }

  return result.packageJson;
}
