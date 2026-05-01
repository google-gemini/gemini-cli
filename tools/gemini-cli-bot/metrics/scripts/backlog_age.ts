/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';
import { execSync } from 'node:child_process';

/**
 * Calculates the average age of the oldest 100 open issues in days.
 */
function run() {
  try {
    const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(first: 100, states: OPEN, orderBy: {field: CREATED_AT, direction: ASC}) {
          nodes {
            createdAt
          }
        }
      }
    }
    `;
    const output = execSync(
      `gh api graphql -F owner=${GITHUB_OWNER} -F repo=${GITHUB_REPO} -f query='${query}'`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    const data = JSON.parse(output).data.repository;
    const issues = data.issues.nodes;

    if (issues.length === 0) {
      process.stdout.write('backlog_age_days,0\n');
      return;
    }

    const now = new Date().getTime();
    const totalAgeDays = issues.reduce(
      (acc: number, issue: { createdAt: string }) => {
        const created = new Date(issue.createdAt).getTime();
        return acc + (now - created) / (1000 * 60 * 60 * 24);
      },
      0,
    );

    const avgAgeDays = totalAgeDays / issues.length;
    process.stdout.write(
      `backlog_age_days,${Math.round(avgAgeDays * 100) / 100}\n`,
    );
  } catch (error) {
    process.stderr.write(
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

run();
