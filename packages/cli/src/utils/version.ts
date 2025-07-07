/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { getPackageJson } from './package.js';

function getGitShortCommitHash(): Promise<string | null> {
  return new Promise((resolve) => {
    exec('git rev-parse --short HEAD', { encoding: 'utf-8' }, (error, stdout) => {
      if (error) {
        // If git is not available or command fails, resolve with null.
        return resolve(null);
      }
      return resolve(stdout.trim());
    });
  });
}

export async function getCliVersion(): Promise<string> {
  const pkgJson = await getPackageJson();
  if (process.env.CLI_VERSION) {
    // Use explicit CLI_VERSION for release builds
    return process.env.CLI_VERSION;
  }
  // For development builds, append git short hash if available
  const version = pkgJson?.version || 'unknown';
  const gitHash = await getGitShortCommitHash();

  return gitHash ? `${version}+${gitHash}` : version;
}
