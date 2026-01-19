/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Octokit } from '@octokit/rest';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import prompts from 'prompts';

if (!process.env.GITHUB_TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable is required.');
  process.exit(1);
}

const argv = yargs(hideBin(process.argv))
  .option('query', {
    alias: 'q',
    type: 'string',
    description:
      'Search query to find duplicate issues (e.g. "function response parts")',
    demandOption: true,
  })
  .option('canonical', {
    alias: 'c',
    type: 'number',
    description: 'The canonical issue number to duplicate others to',
    demandOption: true,
  })
  .option('pr', {
    type: 'string',
    description:
      'Optional Pull Request URL or ID to mention in the closing comment',
  })
  .option('owner', {
    type: 'string',
    default: 'google-gemini',
    description: 'Repository owner',
  })
  .option('repo', {
    type: 'string',
    default: 'gemini-cli',
    description: 'Repository name',
  })
  .option('dry-run', {
    alias: 'd',
    type: 'boolean',
    default: false,
    description: 'Run without making actual changes (read-only mode)',
  })
  .option('auto', {
    type: 'boolean',
    default: false,
    description:
      'Automatically close all duplicates without prompting (batch mode)',
  })
  .help()
  .parse();

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const { query, canonical, pr, owner, repo, dryRun, auto } = argv;

// Construct the full search query ensuring it targets the specific repo and open issues
const fullSearchQuery = `repo:${owner}/${repo} is:issue is:open ${query}`;

async function run() {
  console.log(`Searching for issues matching: ${fullSearchQuery}`);
  if (dryRun) {
    console.log('--- DRY RUN MODE: No changes will be made ---');
  }

  try {
    const issues = await octokit.paginate(
      octokit.rest.search.issuesAndPullRequests,
      {
        q: fullSearchQuery,
      },
    );

    console.log(`Found ${issues.length} issues.`);

    for (const issue of issues) {
      if (issue.number === canonical) {
        console.log(`Skipping canonical issue #${issue.number}`);
        continue;
      }

      console.log(
        `Processing issue #${issue.number}: ${issue.title} (by @${issue.user?.login})`,
      );

      if (!auto && !dryRun) {
        const response = await prompts({
          type: 'confirm',
          name: 'value',
          message: `Close issue #${issue.number} "${issue.title}" created by @${issue.user?.login}?`,
          initial: true,
        });

        if (!response.value) {
          console.log(`Skipping issue #${issue.number}`);
          continue;
        }
      }

      let commentBody = `Closing this issue as a duplicate of #${canonical}.`;
      if (pr) {
        commentBody += ` Please note that this issue should be resolved by PR ${pr}.`;
      }

      try {
        if (!dryRun) {
          // Add comment
          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issue.number,
            body: commentBody,
          });
          console.log(`  Added comment.`);

          // Close issue
          await octokit.rest.issues.update({
            owner,
            repo,
            issue_number: issue.number,
            state: 'closed',
            state_reason: 'duplicate',
          });
          console.log(`  Closed issue.`);
        } else {
          console.log(`  [DRY RUN] Would add comment: "${commentBody}"`);
          console.log(`  [DRY RUN] Would close issue #${issue.number}`);
        }
      } catch (error) {
        console.error(
          `  Failed to process issue #${issue.number}:`,
          error.message,
        );
      }
    }
  } catch (error) {
    console.error('Error searching for issues:', error.message);
    process.exit(1);
  }
}

run().catch(console.error);
