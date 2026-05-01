/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';
import { execSync } from 'node:child_process';

interface IssueNode {
  labels: {
    nodes: Array<{ name: string }>;
  };
}

/**
 * Calculates the distribution of open issues across priority labels.
 */
function run() {
  try {
    // Fetch last 100 open issues and their labels.
    // Using 'last' to get more recent context, but distribution is better from a larger sample.
    const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(last: 100, states: OPEN) {
          nodes {
            labels(first: 20) {
              nodes {
                name
              }
            }
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
    const issues: IssueNode[] = data.issues.nodes;

    const distribution: Record<string, number> = {
      p0: 0,
      p1: 0,
      p2: 0,
      p3: 0,
      other: 0,
    };

    issues.forEach((issue) => {
      let found = false;
      issue.labels.nodes.forEach((label) => {
        const name = label.name.toLowerCase();
        if (name.includes('p0')) {
          distribution.p0++;
          found = true;
        } else if (name.includes('p1')) {
          distribution.p1++;
          found = true;
        } else if (name.includes('p2')) {
          distribution.p2++;
          found = true;
        } else if (name.includes('p3')) {
          distribution.p3++;
          found = true;
        }
      });
      if (!found) {
        distribution.other++;
      }
    });

    process.stdout.write(`priority_p0_count,${distribution.p0}\n`);
    process.stdout.write(`priority_p1_count,${distribution.p1}\n`);
    process.stdout.write(`priority_p2_count,${distribution.p2}\n`);
    process.stdout.write(`priority_p3_count,${distribution.p3}\n`);
    process.stdout.write(`priority_none_count,${distribution.other}\n`);

  } catch (error) {
    process.stderr.write(
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

run();
