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
      issues(states: OPEN, first: 100, orderBy: {field: CREATED_AT, direction: ASC}) {
        nodes {
          createdAt
        }
      }
    }
  }
  `;
  const output = execSync(
    `gh api graphql -F owner=${GITHUB_OWNER} -F repo=${GITHUB_REPO} -f query='${query}'`,
    { encoding: 'utf-8' },
  );
  const data = JSON.parse(output).data.repository;
  const issues = data.issues.nodes;

  if (issues.length === 0) {
    process.stdout.write(`backlog_age_days,0\n`);
  } else {
    const now = new Date().getTime();
    const totalAge = issues.reduce(
      (acc: number, issue: { createdAt: string }) => {
        const created = new Date(issue.createdAt).getTime();
        return acc + (now - created);
      },
      0,
    );
    const avgAgeDays = totalAge / issues.length / (1000 * 60 * 60 * 24);
    process.stdout.write(
      `backlog_age_days,${Math.round(avgAgeDays * 100) / 100}\n`,
    );
  }
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
