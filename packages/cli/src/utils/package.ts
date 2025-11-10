/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  readPackageUp,
  type PackageJson as BasePackageJson,
} from 'read-package-up';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export type PackageJson = BasePackageJson & {
  config?: {
    sandboxImageUri?: string;
  };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let packageJson: PackageJson | undefined;

export async function getPackageJson(): Promise<PackageJson | undefined> {
  if (packageJson) {
    return packageJson;
  }

  const result = await readPackageUp({ cwd: __dirname });
  if (!result) {
    // This should only happen in malformed installations where package.json
    // is missing from the entire directory tree. Log a warning but return
    // undefined to allow callers to gracefully degrade (e.g., version: 'unknown').
    console.warn(
      'Warning: Could not find package.json. CLI features may be degraded.',
    );
    return;
  }

  packageJson = result.packageJson;
  return packageJson;
}
