/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

async function run() {
  try {
    const output = execSync(`gh issue list --state open --label "status/need-triage" --json number,title,author,comments,createdAt --limit 1000`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const issues = JSON.parse(output);

    const userCounts = {};
    const ageStats = {
        lessThanWeek: 0,
        oneToFourWeeks: 0,
        olderThanMonth: 0
    };

    const now = new Date();

    for (const issue of issues) {
        const login = issue.author.login;
        userCounts[login] = (userCounts[login] || 0) + 1;

        const createdAt = new Date(issue.createdAt);
        const daysOld = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

        if (daysOld < 7) ageStats.lessThanWeek++;
        else if (daysOld < 30) ageStats.oneToFourWeeks++;
        else ageStats.olderThanMonth++;
    }

    const topUsers = Object.entries(userCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    console.log(`Total Untriaged Issues: ${issues.length}`);
    console.log('Age Stats:', ageStats);
    console.log('Top Reporters for Untriaged Issues:', topUsers);

  } catch (err) {
    console.error('Error analyzing untriaged issues:', err);
    process.exit(1);
  }
}

run();
