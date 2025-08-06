/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'node:child_process';

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
    exec('fzf --version', (err) => {
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
  const stdout = await new Promise<string>((resolve) => {
    const { stdin } = exec(`fzf --filter "${pattern}"`, {}, (_err, stdout) => {
      resolve(stdout);
    });

    stdin?.write(allPaths.join('\n'));
    stdin?.end();
  });

  return stdout.split('\n').filter(Boolean);
}
