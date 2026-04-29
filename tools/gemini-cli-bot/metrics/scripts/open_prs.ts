/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';
import { execSync } from 'node:child_process';

try {
  const query = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: OPEN) {
        totalCount
      }
    }
  }
  `;
  const output = execSync(
    'gh api graphql -F owner=$OWNER -F repo=$REPO -f query=@-',
    {
      encoding: 'utf-8',
      input: query,
      env: { ...process.env, OWNER: GITHUB_OWNER, REPO: GITHUB_REPO },
    },
  );
  const response = JSON.parse(output);
  if (response.errors) {
    throw new Error(response.errors.map((e: { message: string }) => e.message).join(', '));
  }
  const count = response.data.repository.pullRequests.totalCount;
  console.log(`open_prs,${count}`);
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
