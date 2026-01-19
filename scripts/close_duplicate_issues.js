/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Octokit } from '@octokit/rest';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

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
  .help()
  .parse();

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const { query, canonical, pr, owner, repo } = argv;

// Construct the full search query ensuring it targets the specific repo and open issues
// Note: We wrap the user query in quotes if it contains spaces to ensure it's treated as a phrase if needed,
// but usually passing it as part of the string is fine.
const fullSearchQuery = `repo:${owner}/${repo} is:issue is:open ${query}`;

async function run() {
  console.log(`Searching for issues matching: ${fullSearchQuery}`);

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

      console.log(`Processing issue #${issue.number}: ${issue.title}`);

      let commentBody = `Closing this issue as a duplicate of #${canonical}.`;
      if (pr) {
        commentBody += ` Please note that this issue should be resolved by PR ${pr}.`;
      }

      try {
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
          state_reason: 'not_planned',
        });
        console.log(`  Closed issue.`);
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
