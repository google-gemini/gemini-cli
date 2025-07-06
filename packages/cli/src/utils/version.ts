/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { getPackageJson } from './package.js';

function getGitShortCommitHash(): string | null {
  try {
    // Run git command to get short commit hash
    const stdout = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' });
    return stdout.trim();
  } catch {
    // If git is not available or command fails, return null
    return null;
  }
}

export async function getCliVersion(): Promise<string> {
  const pkgJson = await getPackageJson();
  if (process.env.CLI_VERSION) {
    // Use explicit CLI_VERSION for release builds
    return process.env.CLI_VERSION;
  }
  // For development builds, append git short hash if available
  const version = pkgJson?.version || 'unknown';
  const gitHash = getGitShortCommitHash();

  return gitHash ? `${version}-${gitHash}` : version;
}
