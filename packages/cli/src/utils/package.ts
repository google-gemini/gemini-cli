/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { up as readPackageUp } from 'empathic/package';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFile } from 'fs/promises';

export type PackageJson = Record<string, unknown> & {
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

  const packagePath = readPackageUp({ cwd: __dirname });

  if (!packagePath) {
    // TODO: Maybe bubble this up as an error.
    return;
  }

  try {
    const result = JSON.parse(await readFile(packagePath, 'utf8'));
    return result;
  } catch {
    return;
  }
}
