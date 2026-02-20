#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-env node */
/* global console, process */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

async function run(cmd) {
  try {
    const { stdout } = await execAsync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return stdout.trim();
  } catch (_e) {
    // eslint-disable-line @typescript-eslint/no-unused-vars
    return null;
  }
}

const IGNORE_MESSAGES = [
  'thank you so much for your contribution to Gemini CLI!',
  "I'm currently reviewing this pull request and will post my feedback shortly.",
  'This pull request is being closed because it is not currently linked to an issue.',
];

const shouldIgnore = (body) => {
  if (!body) return false;
  return IGNORE_MESSAGES.some((msg) => body.includes(msg));
};

async function main() {
  const branch = await run('git branch --show-current');
  if (!branch) {
    console.error('❌ Could not determine current git branch.');
    process.exit(1);
  }

  const gqlQuery = `query($branch:String!){repository(name:"gemini-cli",owner:"google-gemini"){pullRequests(headRefName:$branch,first:100){nodes{id,number,state,comments(first:100){nodes{createdAt,isMinimized,minimizedReason,author{login},body,url,authorAssociation}},reviews(first:100){nodes{id,author{login},createdAt,isMinimized,minimizedReason,body,state,comments(first:30){nodes{id,replyTo{id},author{login},createdAt,body,isMinimized,minimizedReason,path,line,startLine,originalLine,originalStartLine}}}}}}}}`;

  const [authInfo, diff, commits, rawJson] = await Promise.all([
    run('gh auth status -a'),
    run('gh pr diff'),
    run(
      'git fetch && git log origin/main..origin/$(git branch --show-current)',
    ),
    run(`gh api graphql -F branch="${branch}" -f query='${gqlQuery}'`),
  ]);

  if (!diff) {
    console.error(`⚠️ No active PR found for branch: ${branch}`);
    process.exit(1);
  }

  console.log(`\n# Current GitHub user info:\n\n${authInfo}\n`);
  console.log(`\n# PR diff for current branch: ${branch}\n\n\`\`\``);
  console.log(diff);
  console.log('```');
  console.log(
    `\n# Commit history (origin/main..origin/${branch})\n\n${commits}`,
  );

  const data = JSON.parse(rawJson || '{}');
  const prs = data?.data?.repository?.pullRequests?.nodes || [];

  // Sort PRs by number descending so we check the newest one first
  prs.sort((a, b) => b.number - a.number);

  const pr = prs.find((p) => p.state === 'OPEN') || prs[0];

  if (!pr) {
    console.error('❌ No PR data found.');
    process.exit(1);
  }

  console.log('\n# PR Feedback\n');

  // 1. General PR Comments
  const general = pr.comments.nodes.filter((c) => !shouldIgnore(c.body));
  if (general.length > 0) {
    console.log('\n💬 GENERAL COMMENTS:');
    general.forEach((c) => {
      const minimized = c.isMinimized
        ? ` (Minimized: ${c.minimizedReason})`
        : '';
      console.log(
        `[${c.createdAt}] [${c.author.login}]${minimized}: ${c.body}\n`,
      );
    });
  }

  // 2. Process ALL Review Comments into a single Thread Map
  const allInlineComments = pr.reviews.nodes.flatMap((r) => r.comments.nodes);
  const filteredInlines = allInlineComments.filter(
    (c) => !shouldIgnore(c.body),
  );

  console.log('🔍 CODE REVIEWS & INLINE THREADS:');

  // Print Review Summaries First
  pr.reviews.nodes.forEach((review) => {
    if (review.body && !shouldIgnore(review.body)) {
      const icon = review.state === 'APPROVED' ? '✅' : '💬';
      const minimized = review.isMinimized
        ? ` (Minimized: ${review.minimizedReason})`
        : '';
      console.log(
        `\n${icon} ${review.state} by ${review.author.login} at ${review.createdAt}${minimized}: "${review.body}"`,
      );
    }
  });

  // Build and Print Threads
  const topLevelThreads = filteredInlines.filter((c) => !c.replyTo);

  const printThread = (parentId, depth = 1) => {
    const indent = '  '.repeat(depth);
    filteredInlines
      .filter((c) => c.replyTo?.id === parentId)
      .forEach((reply) => {
        const minimized = reply.isMinimized
          ? ` (Minimized: ${reply.minimizedReason})`
          : '';
        console.log(
          `${indent}↳ [${reply.createdAt}] ${reply.author.login}${minimized}: ${reply.body}`,
        );
        printThread(reply.id, depth + 1);
      });
  };

  topLevelThreads.forEach((c) => {
    const start = c.startLine || c.originalStartLine;
    const end = c.line || c.originalLine;
    const range = start && end && start !== end ? `${start}-${end}` : end || '';
    const fileInfo = c.path
      ? `(${c.path}${range ? `:${range}` : ''}) `
      : range
        ? `(Line ${range}) `
        : '';
    const minimized = c.isMinimized ? ` (Minimized: ${c.minimizedReason})` : '';
    console.log(
      `\n💬 ${minimized}${c.author.login} | ${c.createdAt} ${fileInfo}\n${c.body}`,
    );
    printThread(c.id);
  });

  console.log('\n');
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
