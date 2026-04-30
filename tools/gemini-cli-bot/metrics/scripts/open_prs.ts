/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';

try {
  const query = 'query($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { pullRequests(states: OPEN) { totalCount } } }';
  const output = execSync(
    `gh api graphql -F owner=${GITHUB_OWNER} -F repo=${GITHUB_REPO} -f query='${query}'`,
    {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  ).trim();
  const parsed = JSON.parse(output);
  const totalCount = parsed?.data?.repository?.pullRequests?.totalCount ?? 0;
  process.stdout.write(`open_prs,${totalCount}\n`);
} catch {
  // Fallback if gh fails or no PRs found
  process.stdout.write('open_prs,0\n');
}
