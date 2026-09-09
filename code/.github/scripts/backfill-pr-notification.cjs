/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable */
/* global require, console, process */

/**
 * Script to backfill a process change notification comment to all open PRs
 * not created by members of the 'gemini-cli-maintainers' team.
 *
 * Skip PRs that are already associated with an issue.
 */

const { execFileSync } = require('child_process');

const isDryRun = process.argv.includes('--dry-run');
const REPO = 'google-gemini/gemini-cli';
const ORG = 'google-gemini';
const TEAM_SLUG = 'gemini-cli-maintainers';
const DISCUSSION_URL =
  'https://github.com/google-gemini/gemini-cli/discussions/16706';

/**
 * Executes a GitHub CLI command safely using an argument array.
 */
function runGh(args, options = {}) {
  const { silent = false } = options;
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (!silent) {
      const stderr = error.stderr ? ` Stderr: ${error.stderr.trim()}` : '';
      console.error(
        `❌ Error running gh ${args.join(' ')}: ${error.message}${stderr}`,
      );
    }
    return null;
  }
}

/**
 * Checks if a user is a member of the maintainers team.
 */
const membershipCache = new Map();
function isMaintainer(username) {
  if (membershipCache.has(username)) return membershipCache.get(username);

  // GitHub returns 404 if user is not a member.
  // We use silent: true to avoid logging 404s as errors.
  const result = runGh(
    ['api', `orgs/${ORG}/teams/${TEAM_SLUG}/memberships/${username}`],
    { silent: true },
  );

  const isMember = result !== null;
  membershipCache.set(username, isMember);
  return isMember;
}

async function main() {
  console.log('🔐 GitHub CLI security check...');
  if (runGh(['auth', 'status']) === null) {
    console.error('❌ GitHub CLI (gh) is not authenticated.');
    process.exit(1);
  }

  if (isDryRun) {
    console.log('🧪 DRY RUN MODE ENABLED\n');
  }

  console.log(`📥 Fetching open PRs from ${REPO}...`);
  // Fetch number, author, and closingIssuesReferences to check if linked to an issue
  const prsJson = runGh([
    'pr',
    'list',
    '--repo',
    REPO,
    '--state',
    'open',
    '--limit',
    '1000',
    '--json',
    'number,author,closingIssuesReferences',
  ]);

  if (prsJson === null) process.exit(1);
  const prs = JSON.parse(prsJson);

  console.log(`📊 Found ${prs.length} open PRs. Filtering...`);

  let targetPrs = [];
  for (const pr of prs) {
    const author = pr.author.login;
    const issueCount = pr.closingIssuesReferences
      ? pr.closingIssuesReferences.length
      : 0;

    if (issueCount > 0) {
      // Skip if already linked to an issue
      continue;
    }

    if (!isMaintainer(author)) {
      targetPrs.push(pr);
    }
  }

  console.log(
    `✅ Found ${targetPrs.length} PRs from non-maintainers without associated issues.`,
  );

  const commentBody =
    "\nHi @{AUTHOR}, thank you so much for your contribution to Gemini CLI! We really appreciate the time and effort you've put into this.\n\nWe're making some updates to our contribution process to improve how we track and review changes. Please take a moment to review our recent discussion post: [Improving Our Contribution Process & Introducing New Guidelines](${DISCUSSION_URL}).\n\nKey Update: Starting **January 26, 2026**, the Gemini CLI project will require all pull requests to be associated with an existing issue. Any pull requests not linked to an issue by that date will be automatically closed.\n\nThank you for your understanding and for being a part of our community!\n  ".trim();

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const pr of targetPrs) {
    const prNumber = String(pr.number);
    const author = pr.author.login;

    // Check if we already commented (idempotency)
    // We use silent: true here because view might fail if PR is deleted mid-run
    const existingComments = runGh(
      [
        'pr',
        'view',
        prNumber,
        '--repo',
        REPO,
        '--json',
        'comments',
        '--jq',
        `.comments[].body | contains("${DISCUSSION_URL}")`,
      ],
      { silent: true },
    );

    if (existingComments && existingComments.includes('true')) {
      console.log(
        `⏭️  PR #${prNumber} already has the notification. Skipping.`,
      );
      skipCount++;
      continue;
    }

    if (isDryRun) {
      console.log(`[DRY RUN] Would notify @${author} on PR #${prNumber}`);
      successCount++;
    } else {
      console.log(`💬 Notifying @${author} on PR #${prNumber}...`);
      const personalizedComment = commentBody.replace('{AUTHOR}', author);
      const result = runGh([
        'pr',
        'comment',
        prNumber,
        '--repo',
        REPO,
        '--body',
        personalizedComment,
      ]);

      if (result !== null) {
        successCount++;
      } else {
        failCount++;
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   - Notified: ${successCount}`);
  console.log(`   - Skipped:  ${skipCount}`);
  console.log(`   - Failed:   ${failCount}`);

  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
