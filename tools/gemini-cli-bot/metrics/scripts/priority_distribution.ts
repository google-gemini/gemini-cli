/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GITHUB_OWNER, GITHUB_REPO } from '../types.js';
import { execSync } from 'node:child_process';

/**
 * Calculates the distribution of open issues across priority labels.
 */
function run() {
  try {
    const repo = `${GITHUB_OWNER}/${GITHUB_REPO}`;
    const query = `
    query($p0: String!, $p1: String!, $p2: String!, $p3: String!, $all: String!) {
      p0: search(query: $p0, type: ISSUE, first: 0) { issueCount }
      p1: search(query: $p1, type: ISSUE, first: 0) { issueCount }
      p2: search(query: $p2, type: ISSUE, first: 0) { issueCount }
      p3: search(query: $p3, type: ISSUE, first: 0) { issueCount }
      all: search(query: $all, type: ISSUE, first: 0) { issueCount }
    }
    `;

    const variables = {
      p0: `is:issue is:open repo:${repo} label:p0`,
      p1: `is:issue is:open repo:${repo} label:p1`,
      p2: `is:issue is:open repo:${repo} label:p2`,
      p3: `is:issue is:open repo:${repo} label:p3`,
      all: `is:issue is:open repo:${repo}`,
    };

    const output = execSync(
      `gh api graphql -F p0='${variables.p0}' -F p1='${variables.p1}' -F p2='${variables.p2}' -F p3='${variables.p3}' -F all='${variables.all}' -f query='${query}'`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();

    const data = JSON.parse(output).data;
    const p0Count = data.p0.issueCount;
    const p1Count = data.p1.issueCount;
    const p2Count = data.p2.issueCount;
    const p3Count = data.p3.issueCount;
    const totalOpen = data.all.issueCount;
    const noneCount = totalOpen - (p0Count + p1Count + p2Count + p3Count);

    process.stdout.write(`priority_p0_count,${p0Count}\n`);
    process.stdout.write(`priority_p1_count,${p1Count}\n`);
    process.stdout.write(`priority_p2_count,${p2Count}\n`);
    process.stdout.write(`priority_p3_count,${p3Count}\n`);
    process.stdout.write(`priority_none_count,${noneCount}\n`);
  } catch (error) {
    process.stderr.write(
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

run();
