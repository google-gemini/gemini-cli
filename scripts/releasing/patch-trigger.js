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

/**
 * Extract base version, original pr, and originalPr info from hotfix branch name.
 * Formats:
 *  - New NEW: hotfix/v0.5.3/v0.5.4/preview/cherry-pick-abc/pr-1234 -> v0.5.4, preview, 1234
 *  - New format: hotfix/v0.5.3/preview/cherry-pick-abc -> v0.5.3 and preview
 *  - Old format: hotfix/v0.5.3/cherry-pick-abc -> v0.5.3 and stable (default)
 * We check the formats from newest to oldest. If the channel found is invalid,
 * an error is thrown.
 */
function getBranchInfo({ branchName, context }) {
  const parts = branchName.split('/');
  const version = parts[1];
  let prNum;
  let channel = 'stable'; // default for old format
  if (parts.length >= 6 && (parts[3] === 'stable' || parts[3] === 'preview')) {
    channel = parts[3];
    const prMatch = parts[5].match(/pr-(\d+)/);
    prNum = prMatch[1];
  } else if (
    parts.length >= 4 &&
    (parts[2] === 'stable' || parts[2] === 'preview')
  ) {
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

  return { channel, prNum, version };
}

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
    .option('force-skip-tests', {
      description: 'Skip the "Run Tests" step in testing',
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
  const forceSkipTests =
    argv.forceSkipTests || process.env.FORCE_SKIP_TESTS === 'true';

  if (!headRef) {
    throw new Error(
      'head-ref is required. Use --head-ref or set HEAD_REF environment variable.',
    );
  }

  console.log(`Processing patch trigger for branch: ${headRef}`);

  const { prNum, version, channel } = getBranchInfo({
    branchName: headRef,
    context,
  });

  let originalPr = prNum;
  console.log(`Found originalPr: ${prNum} from hotfix branch`);

  // Fallback to using PR search (inconsistent) if no pr found in branch name.
  if (!testMode && !originalPr) {
    try {
      console.log('Looking for original PR using search...');
      const { execFileSync } = await import('node:child_process');

      // Split search string into searchArgs to prevent triple escaping on the quoted filters
      const searchArgs =
        `repo:${context.repo.owner}/${context.repo.repo} is:pr in:comments "${headRef}"`.split(
          ' ',
        );
      console.log('Search args:', searchArgs);
      // Use gh CLI to search for PRs with comments referencing the hotfix branch
      const result = execFileSync(
        'gh',
        [
          'search',
          'prs',
          '--json',
          'number,title',
          '--limit',
          '1',
          ...searchArgs,
          'Patch PR Created',
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN },
        },
      );

      const searchResults = JSON.parse(result);
      if (searchResults && searchResults.length > 0) {
        originalPr = searchResults[0].number;
        console.log(`Found original PR: #${originalPr}`);
      } else {
        console.log('Could not find a matching original PR via search.');
      }
    } catch (e) {
      console.log('Could not determine original PR:', e.message);
    }
  }
  if (!originalPr && testMode) {
    console.log('Skipping original PR lookup (test mode)');
    originalPr = 8655; // Mock for testing
  }

  if (!originalPr) {
    throw new Error(
      'Could not find the original PR for this patch. Cannot proceed with release.',
    );
  }

  const releaseRef = `release/${version}-pr-${originalPr}`;
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

  // Trigger the release workflow
  console.log(`Triggering release workflow: ${workflowId}`);
  if (!testMode) {
    try {
      const { execFileSync } = await import('node:child_process');

      const args = [
        'workflow',
        'run',
        workflowId,
        '--ref',
        'main',
        '--field',
        `type=${channel}`,
        '--field',
        `dry_run=${isDryRun.toString()}`,
        '--field',
        `force_skip_tests=${forceSkipTests.toString()}`,
        '--field',
        `release_ref=${releaseRef}`,
        '--field',
        originalPr ? `original_pr=${originalPr.toString()}` : 'original_pr=',
      ];

      console.log(`Running command: gh ${args.join(' ')}`);

      execFileSync('gh', args, {
        stdio: 'inherit',
        env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN },
      });

      console.log('✅ Workflow dispatch completed successfully');
    } catch (e) {
      console.error('❌ Failed to dispatch workflow:', e.message);
      throw e;
    }
  } else {
    console.log('✅ Would trigger workflow with inputs:', {
      type: channel,
      dry_run: isDryRun.toString(),
      force_skip_tests: forceSkipTests.toString(),
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

    if (!testMode) {
      let tempDir;
      try {
        const { execFileSync } = await import('node:child_process');
        const { writeFileSync, mkdtempSync } = await import('node:fs');
        const { join } = await import('node:path');
        const { tmpdir } = await import('node:os');

        // Create secure temporary directory and file
        tempDir = mkdtempSync(join(tmpdir(), 'patch-trigger-'));
        const tempFile = join(tempDir, 'comment.md');
        writeFileSync(tempFile, commentBody);

        execFileSync(
          'gh',
          ['pr', 'comment', originalPr.toString(), '--body-file', tempFile],
          {
            stdio: 'inherit',
            env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN },
          },
        );

        console.log('✅ Comment posted successfully');
      } catch (e) {
        console.error('❌ Failed to post comment:', e.message);
        // Don't throw here since the main workflow dispatch succeeded
      } finally {
        // Clean up temp directory and all its contents
        if (tempDir) {
          try {
            const { rmSync } = await import('node:fs');
            rmSync(tempDir, { recursive: true, force: true });
          } catch (cleanupError) {
            console.warn(
              '⚠️ Failed to clean up temp directory:',
              cleanupError.message,
            );
          }
        }
      }
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
