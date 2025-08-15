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
        return resolve(null);
      }
      return resolve(stdout.trim());
    });
  });
}

function getCurrentDateYYMMDD(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

export async function getCliVersion(): Promise<string> {
  const pkgJson = await getPackageJson();
  const baseVersion = pkgJson?.version || 'unknown';

  if (process.env.CLI_VERSION) {
    return process.env.CLI_VERSION;
  }

  const gitHash = await getGitShortCommitHash();
  const date = getCurrentDateYYMMDD();

  return gitHash ? `${baseVersion}-nightly.${date}.${gitHash}` : `${baseVersion}-nightly.${date}`;
}
