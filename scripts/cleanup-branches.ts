/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import * as readline from 'node:readline/promises';
import * as process from 'node:process';

function runCmd(cmd: string): string {
  return execSync(cmd, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'ignore'],
  }).trim();
}

async function main() {
  try {
    runCmd('gh --version');
  } catch {
    console.error(
      'Error: "gh" CLI is required but not installed or not working.',
    );
    process.exit(1);
  }

  try {
    runCmd('git --version');
  } catch {
    console.error('Error: "git" is required.');
    process.exit(1);
  }

  console.log('Fetching remote branches from origin...');
  let allBranchesOutput = '';
  try {
    // Also fetch to ensure we have the latest commit dates
    console.log(
      'Running git fetch to ensure we have up-to-date commit dates and prune stale branches...',
    );
    runCmd('git fetch origin --prune');

    // Get all branches with their commit dates
    allBranchesOutput = runCmd(
      "git for-each-ref --format='%(refname:lstrip=3) %(committerdate:unix)' refs/remotes/origin",
    );
  } catch {
    console.error('Failed to fetch branches from origin.');
    process.exit(1);
  }

  const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);

  const remoteBranches: { name: string; lastCommitDate: number }[] =
    allBranchesOutput
      .split(/\r?\n/)
      .map((line) => {
        const parts = line.split(' ');
        if (parts.length < 2) return null;
        const date = parseInt(parts.pop() || '0', 10);
        const name = parts.join(' ');
        return { name, lastCommitDate: date };
      })
      .filter((b): b is { name: string; lastCommitDate: number } => b !== null);

  console.log(`Found ${remoteBranches.length} branches on origin.`);

  console.log('Fetching open PRs...');
  let openPrsJson = '[]';
  try {
    openPrsJson = runCmd(
      'gh pr list --state open --limit 5000 --json headRefName',
    );
  } catch {
    console.error('Failed to fetch open PRs.');
    process.exit(1);
  }

  const openPrs = JSON.parse(openPrsJson);
  const openPrBranches = new Set(
    openPrs.map((pr: { headRefName: string }) => pr.headRefName),
  );

  const protectedPattern =
    /^(main|master|next|release[-/].*|hotfix[-/].*|v\d+.*|HEAD|gh-readonly-queue.*)$/;

  const branchesToDelete = remoteBranches.filter((branch) => {
    if (protectedPattern.test(branch.name)) {
      return false;
    }
    if (openPrBranches.has(branch.name)) {
      return false;
    }

    const ageInSeconds = now - branch.lastCommitDate;
    if (ageInSeconds < THIRTY_DAYS_IN_SECONDS) {
      return false; // Skip branches pushed to recently
    }

    return true;
  });

  if (branchesToDelete.length === 0) {
    console.log('No remote branches to delete.');
    return;
  }

  console.log(
    '\nThe following remote branches are NOT release branches, have NO active PR, and are OLDER than 30 days:',
  );
  console.log(
    '---------------------------------------------------------------------',
  );
  branchesToDelete.forEach((b) => console.log(` - ${b.name}`));
  console.log(
    '---------------------------------------------------------------------',
  );
  console.log(`Total to delete: ${branchesToDelete.length}`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await rl.question(
    `\nDo you want to delete these ${branchesToDelete.length} remote branches from origin? (y/N) `,
  );
  rl.close();

  if (answer.toLowerCase() === 'y') {
    console.log('Deleting remote branches...');
    // Delete in batches to avoid hitting command line length limits
    const batchSize = 50;
    for (let i = 0; i < branchesToDelete.length; i += batchSize) {
      const batch = branchesToDelete.slice(i, i + batchSize).map((b) => b.name);
      const branchList = batch.join(' ');
      console.log(`Deleting remote batch ${Math.floor(i / batchSize) + 1}...`);
      try {
        execSync(`git push origin --delete ${branchList}`, {
          stdio: 'inherit',
        });
      } catch {
        console.warn('Batch failed, trying to delete branches individually...');
        for (const branch of batch) {
          try {
            execSync(`git push origin --delete ${branch}`, {
              stdio: 'pipe',
            });
          } catch (err: unknown) {
            const error = err as { stderr?: Buffer; message?: string };
            const stderr = error.stderr?.toString() || '';
            if (!stderr.includes('remote ref does not exist')) {
              console.error(
                `Failed to delete branch "${branch}":`,
                stderr.trim() || error.message,
              );
            }
          }
        }
      }
    }

    console.log('Cleaning up local tracking branches...');
    try {
      execSync('git remote prune origin', { stdio: 'inherit' });
    } catch {
      console.error('Failed to prune local tracking branches.');
    }
    console.log('Cleanup complete.');
  } else {
    console.log('Operation cancelled.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
