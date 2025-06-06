/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readPackageUp } from 'read-package-up';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cliVersion: string | undefined;

export async function getCliVersion(): Promise<string> {
  if (cliVersion) {
    return cliVersion;
  }

  if (process.env.CLI_VERSION) {
    cliVersion = process.env.CLI_VERSION;
    return cliVersion;
  }

  try {
    const readUpResult = await readPackageUp({ cwd: __dirname });
    cliVersion = readUpResult?.packageJson.version || 'unknown';
  } catch (_e) {
    cliVersion = 'unknown';
  }

  return cliVersion;
}
