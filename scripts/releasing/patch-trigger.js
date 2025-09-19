#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Script for patch release trigger workflow (step 2).
 * Handles channel detection, workflow dispatch, and user feedback.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('head-ref', {
      description:
        'The hotfix branch name (e.g., hotfix/v0.5.3/preview/cherry-pick-abc1234)',
      type: 'string',
      demandOption: !process.env.GITHUB_ACTIONS,
    })
    .option('pr-body', {
      description: 'The PR body content',
      type: 'string',
      default: '',
    })
    .option('dry-run', {
      description: 'Run in test mode without actually triggering workflows',
      type: 'boolean',
      default: false,
    })
    .option('test', {
      description: 'Test mode - validate logic without GitHub API calls',
      type: 'boolean',
      default: false,
    })
    .example(
      '$0 --head-ref "hotfix/v0.5.3/preview/cherry-pick-abc1234" --test',
      'Test channel detection logic',
    )
    .example(
      '$0 --head-ref "hotfix/v0.5.3/stable/cherry-pick-abc1234" --dry-run',
      'Test with GitHub API in dry-run mode',
    )
    .help()
    .alias('help', 'h').argv;

  const testMode = argv.test || process.env.TEST_MODE === 'true';

  // Initialize GitHub API client only if not in test mode
  let github;
  if (!testMode) {
    const { Octokit } = await import('@octokit/rest');
    github = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
  }

  const context = {
    eventName: process.env.GITHUB_EVENT_NAME || 'pull_request',
    repo: {
      owner: process.env.GITHUB_REPOSITORY_OWNER || 'google-gemini',
      repo: process.env.GITHUB_REPOSITORY_NAME || 'gemini-cli',
    },
    payload: JSON.parse(process.env.GITHUB_EVENT_PAYLOAD || '{}'),
  };

  // Get inputs from CLI args or environment
  const headRef = argv.headRef || process.env.HEAD_REF;
  const body = argv.prBody || process.env.PR_BODY || '';
  const isDryRun = argv.dryRun || body.includes('[DRY RUN]');

  if (!headRef) {
    throw new Error(
      'head-ref is required. Use --head-ref or set HEAD_REF environment variable.',
    );
  }

  console.log(`Processing patch trigger for branch: ${headRef}`);

  // Extract base version and channel from hotfix branch name
  // New format: hotfix/v0.5.3/preview/cherry-pick-abc -> v0.5.3 and preview
  // Old format: hotfix/v0.5.3/cherry-pick-abc -> v0.5.3 and stable (default)
  const parts = headRef.split('/');
  const version = parts[1];
  let channel = 'stable'; // default for old format

  if (parts.length >= 4 && (parts[2] === 'stable' || parts[2] === 'preview')) {
    // New format with explicit channel
    channel = parts[2];
  } else if (context.eventName === 'workflow_dispatch') {
    // Manual dispatch, infer from version name
    channel = version.includes('preview') ? 'preview' : 'stable';
  }

  // Validate channel
  if (channel !== 'stable' && channel !== 'preview') {
    throw new Error(
      `Invalid channel: ${channel}. Must be 'stable' or 'preview'.`,
    );
  }

  const releaseRef = `release/${version}`;
  const workflowId =
    context.eventName === 'pull_request'
      ? 'release-patch-3-release.yml'
      : process.env.WORKFLOW_ID || 'release-patch-3-release.yml';

  console.log(`Detected channel: ${channel}, version: ${version}`);
  console.log(`Release ref: ${releaseRef}`);
  console.log(`Workflow ID: ${workflowId}`);
  console.log(`Dry run: ${isDryRun}`);

  if (testMode) {
    console.log('\n🧪 TEST MODE - No API calls will be made');
    console.log('\n📋 Parsed Results:');
    console.log(`  - Branch: ${headRef}`);
    console.log(
      `  - Channel: ${channel} → npm tag: ${channel === 'stable' ? 'latest' : 'preview'}`,
    );
    console.log(`  - Version: ${version}`);
    console.log(`  - Release ref: ${releaseRef}`);
    console.log(`  - Workflow: ${workflowId}`);
    console.log(`  - Dry run: ${isDryRun}`);
    console.log('\n✅ Channel detection logic working correctly!');
    return;
  }

  // Try to find the original PR that requested this patch
  let originalPr = null;
  if (!testMode && github) {
    try {
      console.log('Looking for original PR using search...');
      // Use GitHub search to find the PR with a comment referencing the hotfix branch.
      // This is much more efficient than listing PRs and their comments.
      const query = `repo:${context.repo.owner}/${context.repo.repo} is:pr is:all in:comments "Patch PR Created" "${headRef}"`;
      const searchResults = await github.rest.search.issuesAndPullRequests({
        q: query,
        sort: 'updated',
        order: 'desc',
        per_page: 1,
      });

      if (searchResults.data.items.length > 0) {
        originalPr = searchResults.data.items[0].number;
        console.log(`Found original PR: #${originalPr}`);
      } else {
        console.log('Could not find a matching original PR via search.');
      }
    } catch (e) {
      console.log('Could not determine original PR:', e.message);
    }
  } else {
    console.log('Skipping original PR lookup (test mode)');
    originalPr = 8655; // Mock for testing
  }

  // Trigger the release workflow
  console.log(`Triggering release workflow: ${workflowId}`);
  if (!testMode && github) {
    await github.rest.actions.createWorkflowDispatch({
      owner: context.repo.owner,
      repo: context.repo.repo,
      workflow_id: workflowId,
      ref: 'main',
      inputs: {
        type: channel,
        dry_run: isDryRun.toString(),
        release_ref: releaseRef,
        original_pr: originalPr ? originalPr.toString() : '',
      },
    });
  } else {
    console.log('✅ Would trigger workflow with inputs:', {
      type: channel,
      dry_run: isDryRun.toString(),
      release_ref: releaseRef,
      original_pr: originalPr ? originalPr.toString() : '',
    });
  }

  // Comment back to original PR if we found it
  if (originalPr) {
    console.log(`Commenting on original PR ${originalPr}...`);
    const npmTag = channel === 'stable' ? 'latest' : 'preview';

    const commentBody = `🚀 **Patch Release Started!**

**📋 Release Details:**
- **Channel**: \`${channel}\` → publishing to npm tag \`${npmTag}\`
- **Version**: \`${version}\`
- **Hotfix PR**: Merged ✅
- **Release Branch**: [\`${releaseRef}\`](https://github.com/${context.repo.owner}/${context.repo.repo}/tree/${releaseRef})

**⏳ Status:** The patch release is now running. You'll receive another update when it completes.

**🔗 Track Progress:**
- [View release workflow](https://github.com/${context.repo.owner}/${context.repo.repo}/actions)`;

    if (!testMode && github) {
      await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: originalPr,
        body: commentBody,
      });
    } else {
      console.log('✅ Would post comment:', commentBody);
    }
  }

  console.log('Patch trigger completed successfully!');
}

main().catch((error) => {
  console.error('Error in patch trigger:', error);
  process.exit(1);
});
