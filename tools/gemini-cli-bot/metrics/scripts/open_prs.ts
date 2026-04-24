/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

try {
  const count = execSync(
    'gh pr list --state open --limit 1000 --json number --jq length',
    {
      encoding: 'utf-8',
    },
  ).trim();
  console.log(`open_prs,${count}`);
} catch {
  // Fallback if gh fails or no PRs found
  console.log('open_prs,0');
}
