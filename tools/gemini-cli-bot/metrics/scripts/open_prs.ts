/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';

try {
  const query = `query { repository(owner: "${GITHUB_OWNER}", name: "${GITHUB_REPO}") { pullRequests(states: OPEN) { totalCount } } }`;
  const output = execSync(
    `gh api graphql -f query='${query}'`,
    {
      encoding: 'utf-8',
    },
  ).trim();
  const parsed = JSON.parse(output);
  const totalCount = parsed?.data?.repository?.pullRequests?.totalCount ?? 0;
  console.log(`open_prs,${totalCount}`);
} catch {
  // Fallback if gh fails or no PRs found
  console.log('open_prs,0');
}
