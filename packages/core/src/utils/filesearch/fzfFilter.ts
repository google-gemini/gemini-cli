/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';

let canUseFzf: boolean | undefined = undefined;

export async function checkCanUseFzf() {
  // In test env, we don't want to use fzf
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST;
  if (isTestEnv) {
    return false;
  }

  if (canUseFzf !== undefined) {
    return canUseFzf;
  }

  await new Promise<void>((resolve) => {
    execFile('fzf', ['--version'], (err) => {
      canUseFzf = err === null;
      resolve();
    });
  });
  return canUseFzf ?? false;
}

export async function filterByFzf(
  allPaths: string[],
  pattern: string,
): Promise<string[]> {
  const stdout = await new Promise<string>((resolve, reject) => {
    const { stdin } = execFile('fzf', ['--filter', pattern], (err, stdout) => {
      // fzf exits with code 1 if there are no matches. This is not an error for us.
      if (err && err.code !== 1) {
        return reject(err);
      }
      resolve(stdout);
    });

    stdin?.write(allPaths.join('\n'));
    stdin?.end();
  });

  return stdout.split('\n').filter(Boolean);
}
