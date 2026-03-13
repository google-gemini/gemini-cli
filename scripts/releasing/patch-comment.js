#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Script for commenting back to original PR with patch release results.
 * Used by the patch release workflow (step 3).
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('original-pr', {
      description: 'The original PR number to comment on',
      type: 'number',
      demandOption: !process.env.GITHUB_ACTIONS,
    })
    .option('success', {
      description: 'Whether the release succeeded',
      type: 'boolean',
    })
    .option('release-version', {
      description: 'The release version (e.g., 0.5.4)',
      type: 'string',
      demandOption: !process.env.GITHUB_ACTIONS,
    })
    .option('release-tag', {
      description: 'The release tag (e.g., v0.5.4)',
      type: 'string',
    })
    .option('npm-tag', {
      description: 'The npm tag (latest or preview)',
      type: 'string',
    })
    .option('channel', {
      description: 'The channel (stable or preview)',
      type: 'string',
      choices: ['stable', 'preview'],
    })
    .option('dry-run', {
      description: 'Whether this was a dry run',
      type: 'boolean',
      default: false,
    })
    .option('test', {
      description: 'Test mode - validate logic without GitHub API calls',
      type: 'boolean',
      default: false,
    })
    .example(
      '$0 --original-pr 8655 --success --release-version "0.5.4" --channel stable --test',
      'Test success comment',
    )
    .example(
      '$0 --original-pr 8655 --no-success --channel preview --test',
      'Test failure comment',
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

  const repo = {
    owner: process.env.GITHUB_REPOSITORY_OWNER || 'google-gemini',
    repo: process.env.GITHUB_REPOSITORY_NAME || 'gemini-cli',
  };

  // Get inputs from CLI args or environment
  const originalPr = argv.originalPr || process.env.ORIGINAL_PR;
  const success =
    argv.success !== undefined ? argv.success : process.env.SUCCESS === 'true';
  const releaseVersion = argv.releaseVersion || process.env.RELEASE_VERSION;
  const releaseTag =
    argv.releaseTag ||
    process.env.RELEASE_TAG ||
    (releaseVersion ? `v${releaseVersion}` : null);
  const npmTag =
    argv.npmTag ||
    process.env.NPM_TAG ||
    (argv.channel === 'stable' ? 'latest' : 'preview');
  const channel = argv.channel || process.env.CHANNEL || 'stable';
  const dryRun = argv.dryRun || process.env.DRY_RUN === 'true';
  const runId = process.env.GITHUB_RUN_ID || '12345678';
  const raceConditionFailure = process.env.RACE_CONDITION_FAILURE === 'true';

  // Current version info for race condition failures
  const currentReleaseVersion = process.env.CURRENT_RELEASE_VERSION;
  const currentReleaseTag = process.env.CURRENT_RELEASE_TAG;
  const currentPreviousTag = process.env.CURRENT_PREVIOUS_TAG;

  if (!originalPr) {
    console.log('No original PR specified, skipping comment');
    return;
  }

  console.log(
    `Commenting on original PR ${originalPr} with ${success ? 'success' : 'failure'} status`,
  );

  if (testMode) {
    console.log('\n🧪 TEST MODE - No API calls will be made');
    console.log('\n📋 Inputs:');
    console.log(`  - Original PR: ${originalPr}`);
    console.log(`  - Success: ${success}`);
    console.log(`  - Release Version: ${releaseVersion}`);
    console.log(`  - Release Tag: ${releaseTag}`);
    console.log(`  - NPM Tag: ${npmTag}`);
    console.log(`  - Channel: ${channel}`);
    console.log(`  - Dry Run: ${dryRun}`);
    console.log(`  - Run ID: ${runId}`);
  }

  let commentBody;

  if (success) {
    commentBody = `✅ **[Step 4/4] Patch Release Complete!**

**📦 Release Details:**
- **Version**: [\`${releaseVersion}\`](https://github.com/${repo.owner}/${repo.repo}/releases/tag/${releaseTag})
- **NPM Tag**: \`${npmTag}\`
- **Channel**: \`${channel}\`
- **Dry Run**: ${dryRun}

**🎉 Status:** Your patch has been successfully released and published to npm!

**📝 What's Available:**
- **GitHub Release**: [View release ${releaseTag}](https://github.com/${repo.owner}/${repo.repo}/releases/tag/${releaseTag})
- **NPM Package**: \`npm install @google/gemini-cli@${npmTag}\`

**🔗 Links:**
- [GitHub Release](https://github.com/${repo.owner}/${repo.repo}/releases/tag/${releaseTag})
- [This release workflow run](https://github.com/${repo.owner}/${repo.repo}/actions/runs/${runId})
- [Workflow History](https://github.com/${repo.owner}/${repo.repo}/actions/workflows/release-patch-3-release.yml)`;
  } else if (raceConditionFailure) {
    commentBody = `⚠️ **[Step 4/4] Patch Release Cancelled - Concurrent Release Detected**

**🚦 What Happened:**
Another patch release completed while this one was in progress, causing a version conflict.

**📋 Details:**
- **Originally planned**: \`${releaseVersion || 'Unknown'}\`
- **Channel**: \`${channel}\`
- **Issue**: Version numbers are no longer sequential due to concurrent releases

**📊 Current State:**${
      currentReleaseVersion
        ? `
- **Latest ${channel} version**: \`${currentPreviousTag?.replace(/^v/, '') || 'unknown'}\`
- **Next patch should be**: \`${currentReleaseVersion}\`
- **New release tag**: \`${currentReleaseTag || 'unknown'}\``
        : `
- **Status**: Version information updated since this release was triggered`
    }

**🔄 Next Steps:**
1. **Request a new patch** - The version calculation will now be correct
2. No action needed on your part - simply request the patch again
3. The system detected this automatically to prevent invalid releases

**💡 Why This Happens:**
Multiple patch releases can't run simultaneously. When they do, the second one is automatically cancelled to maintain version consistency.

**🔗 Details:**
- [This release workflow run](https://github.com/${repo.owner}/${repo.repo}/actions/runs/${runId})
- [Workflow History](https://github.com/${repo.owner}/${repo.repo}/actions/workflows/release-patch-3-release.yml)`;
  } else {
    commentBody = `❌ **[Step 4/4] Patch Release Failed!**

**📋 Details:**
- **Version**: \`${releaseVersion || 'Unknown'}\`
- **Channel**: \`${channel}\`
- **Error**: The patch release workflow encountered an error

**🔍 Next Steps:**
1. Check the workflow logs for detailed error information
2. The maintainers have been notified via automatic issue creation
3. You may need to retry the patch once the issue is resolved

**🔗 Troubleshooting:**
- [This release workflow run](https://github.com/${repo.owner}/${repo.repo}/actions/runs/${runId})
- [View workflow logs](https://github.com/${repo.owner}/${repo.repo}/actions/runs/${runId})
- [Workflow History](https://github.com/${repo.owner}/${repo.repo}/actions/workflows/release-patch-3-release.yml)`;
  }

  if (testMode) {
    console.log('\n💬 Would post comment:');
    console.log('----------------------------------------');
    console.log(commentBody);
    console.log('----------------------------------------');
    console.log('\n✅ Comment generation working correctly!');
  } else if (github) {
    await github.rest.issues.createComment({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: parseInt(originalPr),
      body: commentBody,
    });

    console.log(`Successfully commented on PR ${originalPr}`);
  } else {
    console.log('No GitHub client available');
  }
}

main().catch((error) => {
  console.error('Error commenting on PR:', error);
  process.exit(1);
});
