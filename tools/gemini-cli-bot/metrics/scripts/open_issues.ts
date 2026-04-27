/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';

try {
  const count = execSync(
    `gh api "search/issues?q=repo:${GITHUB_OWNER}/${GITHUB_REPO}+is:issue+is:open" --jq .total_count`,
    {
      encoding: 'utf-8',
    },
  ).trim();
  console.log(`open_issues,${count}`);
} catch {
  // Fallback if search fails
  try {
    const count = execSync(
      `gh issue list -R ${GITHUB_OWNER}/${GITHUB_REPO} --state open --limit 5000 --json number --jq length`,
      {
        encoding: 'utf-8',
      },
    ).trim();
    console.log(`open_issues,${count}`);
  } catch {
    console.log('open_issues,0');
  }
}
