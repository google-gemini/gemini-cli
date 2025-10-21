#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Script for commenting on the original PR after patch creation (step 1).
 * Handles parsing create-patch-pr.js output and creating appropriate feedback.
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
    .option('exit-code', {
      description: 'Exit code from patch creation step',
      type: 'number',
      demandOption: !process.env.GITHUB_ACTIONS,
    })
    .option('commit', {
      description: 'The commit SHA being patched',
      type: 'string',
      demandOption: !process.env.GITHUB_ACTIONS,
    })
    .option('channel', {
      description: 'The channel (stable or preview)',
      type: 'string',
      choices: ['stable', 'preview'],
      demandOption: !process.env.GITHUB_ACTIONS,
    })
    .option('repository', {
      description: 'The GitHub repository (owner/repo format)',
      type: 'string',
      demandOption: !process.env.GITHUB_ACTIONS,
    })
    .option('run-id', {
      description: 'The GitHub workflow run ID',
      type: 'string',
    })
    .option('test', {
      description: 'Test mode - validate logic without GitHub API calls',
      type: 'boolean',
      default: false,
    })
    .example(
      '$0 --original-pr 8655 --exit-code 0 --commit abc1234 --channel preview --repository google-gemini/gemini-cli --test',
      'Test success comment',
    )
    .example(
      '$0 --original-pr 8655 --exit-code 1 --commit abc1234 --channel stable --repository google-gemini/gemini-cli --test',
      'Test failure comment',
    )
    .help()
    .alias('help', 'h').argv;

  const testMode = argv.test || process.env.TEST_MODE === 'true';

  // GitHub CLI is available in the workflow environment
  const hasGitHubCli = !testMode;

  // Get inputs from CLI args or environment
  const originalPr = argv.originalPr || process.env.ORIGINAL_PR;
  const exitCode =
    argv.exitCode !== undefined
      ? argv.exitCode
      : parseInt(process.env.EXIT_CODE || '1');
  const commit = argv.commit || process.env.COMMIT;
  const channel = argv.channel || process.env.CHANNEL;
  const repository =
    argv.repository || process.env.REPOSITORY || 'google-gemini/gemini-cli';
  const runId = argv.runId || process.env.GITHUB_RUN_ID || '0';

  // Validate required parameters
  if (!runId || runId === '0') {
    console.warn(
      'Warning: No valid GitHub run ID found, workflow links may not work correctly',
    );
  }

  if (!originalPr) {
    console.log('No original PR specified, skipping comment');
    return;
  }

  console.log(
    `Analyzing patch creation result for PR ${originalPr} (exit code: ${exitCode})`,
  );

  const [_owner, _repo] = repository.split('/');
  const npmTag = channel === 'stable' ? 'latest' : 'preview';

  if (testMode) {
    console.log('\n🧪 TEST MODE - No API calls will be made');
    console.log('\n📋 Inputs:');
    console.log(`  - Original PR: ${originalPr}`);
    console.log(`  - Exit Code: ${exitCode}`);
    console.log(`  - Commit: ${commit}`);
    console.log(`  - Channel: ${channel} → npm tag: ${npmTag}`);
    console.log(`  - Repository: ${repository}`);
    console.log(`  - Run ID: ${runId}`);
  }

  let commentBody;
  let logContent = '';

  // Get log content from environment variable or generate mock content for testing
  if (testMode && !process.env.LOG_CONTENT) {
    // Create mock log content for testing only if LOG_CONTENT is not provided
    if (exitCode === 0) {
      logContent = `Creating hotfix branch hotfix/v0.5.3/${channel}/cherry-pick-${commit.substring(0, 7)} from release/v0.5.3`;
    } else {
      logContent = 'Error: Failed to create patch';
    }
  } else {
    // Use log content from environment variable
    logContent = process.env.LOG_CONTENT || '';
  }

  if (
    logContent.includes(
      'Failed to create release branch due to insufficient GitHub App permissions',
    )
  ) {
    // GitHub App permission error - extract manual commands
    const manualCommandsMatch = logContent.match(
      /📋 Please run these commands manually to create the branch:[\s\S]*?```bash\s*([\s\S]*?)\s*```/,
    );
    let manualCommands = '';
    if (manualCommandsMatch) {
      manualCommands = manualCommandsMatch[1].trim();
    }

    commentBody = `🔒 **GitHub App Permission Issue**

The patch creation failed due to insufficient GitHub App permissions for creating workflow files.

**📝 Manual Action Required:**
${
  manualCommands
    ? `Please run these commands manually to create the release branch:

\`\`\`bash
${manualCommands}
\`\`\`

After running these commands, you can re-run the patch workflow.`
    : 'Please check the workflow logs for manual commands to run.'
}

**🔗 Links:**
- [View workflow run](https://github.com/${repository}/actions/runs/${runId})`;
  } else if (logContent.includes('already has an open PR')) {
    // Branch exists with existing PR
    const prMatch = logContent.match(/Found existing PR #(\d+): (.*)/);
    if (prMatch) {
      const [, prNumber, prUrl] = prMatch;
      commentBody = `ℹ️ **Patch PR already exists!**

A patch PR for this change already exists: [#${prNumber}](${prUrl}).

**📝 Next Steps:**
1. Review and approve the existing patch PR
2. If it's incorrect, close it and run the patch command again

**🔗 Links:**
- [View existing patch PR #${prNumber}](${prUrl})`;
    }
  } else if (logContent.includes('exists but has no open PR')) {
    // Branch exists but no PR
    const branchMatch = logContent.match(/Hotfix branch (.*) already exists/);
    if (branchMatch) {
      const [, branch] = branchMatch;
      commentBody = `ℹ️ **Patch branch exists but no PR found!**

A patch branch [\`${branch}\`](https://github.com/${repository}/tree/${branch}) exists but has no open PR.

**🔍 Issue:** This might indicate an incomplete patch process.

**📝 Next Steps:**
1. Delete the branch: \`git branch -D ${branch}\`
2. Run the patch command again

**🔗 Links:**
- [View branch on GitHub](https://github.com/${repository}/tree/${branch})`;
    }
  } else if (exitCode === 0) {
    // Success - extract branch info
    const branchMatch = logContent.match(/Creating hotfix branch (.*) from/);
    if (branchMatch) {
      const [, branch] = branchMatch;

      if (testMode) {
        // Mock PR info for testing
        const mockPrNumber = Math.floor(Math.random() * 1000) + 8000;
        const mockPrUrl = `https://github.com/${repository}/pull/${mockPrNumber}`;

        const hasConflicts =
          logContent.includes('Cherry-pick has conflicts') ||
          logContent.includes('[CONFLICTS]');

        commentBody = `🚀 **Patch PR Created!**

**📋 Patch Details:**
- **Channel**: \`${channel}\` → will publish to npm tag \`${npmTag}\`
- **Commit**: \`${commit}\`
- **Hotfix Branch**: [\`${branch}\`](https://github.com/${repository}/tree/${branch})
- **Hotfix PR**: [#${mockPrNumber}](${mockPrUrl})${hasConflicts ? '\n- **⚠️ Status**: Cherry-pick conflicts detected - manual resolution required' : ''}

**📝 Next Steps:**
1. ${hasConflicts ? '⚠️ **Resolve conflicts** in the hotfix PR first' : 'Review and approve the hotfix PR'}: [#${mockPrNumber}](${mockPrUrl})${hasConflicts ? '\n2. **Test your changes** after resolving conflicts' : ''}
${hasConflicts ? '3' : '2'}. Once merged, the patch release will automatically trigger
${hasConflicts ? '4' : '3'}. You'll receive updates here when the release completes

**🔗 Track Progress:**
- [View hotfix PR #${mockPrNumber}](${mockPrUrl})`;
      } else if (hasGitHubCli) {
        // Find the actual PR for the new branch using gh CLI
        try {
          const { spawnSync } = await import('node:child_process');
          const result = spawnSync(
            'gh',
            [
              'pr',
              'list',
              '--head',
              branch,
              '--state',
              'open',
              '--json',
              'number,title,url',
              '--limit',
              '1',
            ],
            { encoding: 'utf8' },
          );

          if (result.error) {
            throw result.error;
          }
          if (result.status !== 0) {
            throw new Error(
              `gh pr list failed with status ${result.status}: ${result.stderr}`,
            );
          }

          const prListOutput = result.stdout;

          const prList = JSON.parse(prListOutput);

          if (prList.length > 0) {
            const pr = prList[0];
            const hasConflicts =
              logContent.includes('Cherry-pick has conflicts') ||
              pr.title.includes('[CONFLICTS]');

            commentBody = `🚀 **Patch PR Created!**

**📋 Patch Details:**
- **Channel**: \`${channel}\` → will publish to npm tag \`${npmTag}\`
- **Commit**: \`${commit}\`
- **Hotfix Branch**: [\`${branch}\`](https://github.com/${repository}/tree/${branch})
- **Hotfix PR**: [#${pr.number}](${pr.url})${hasConflicts ? '\n- **⚠️ Status**: Cherry-pick conflicts detected - manual resolution required' : ''}

**📝 Next Steps:**
1. ${hasConflicts ? '⚠️ **Resolve conflicts** in the hotfix PR first' : 'Review and approve the hotfix PR'}: [#${pr.number}](${pr.url})${hasConflicts ? '\n2. **Test your changes** after resolving conflicts' : ''}
${hasConflicts ? '3' : '2'}. Once merged, the patch release will automatically trigger
${hasConflicts ? '4' : '3'}. You'll receive updates here when the release completes

**🔗 Track Progress:**
- [View hotfix PR #${pr.number}](${pr.url})`;
          } else {
            // Fallback if PR not found yet
            commentBody = `🚀 **Patch PR Created!**

The patch release PR for this change has been created on branch [\`${branch}\`](https://github.com/${repository}/tree/${branch}).

**📝 Next Steps:**
1. Review and approve the patch PR
2. Once merged, the patch release will automatically trigger

**🔗 Links:**
- [View all patch PRs](https://github.com/${repository}/pulls?q=is%3Apr+is%3Aopen+label%3Apatch)`;
          }
        } catch (error) {
          console.log('Error finding PR for branch:', error.message);
          // Fallback
          commentBody = `🚀 **Patch PR Created!**

The patch release PR for this change has been created.

**🔗 Links:**
- [View all patch PRs](https://github.com/${repository}/pulls?q=is%3Apr+is%3Aopen+label%3Apatch)`;
        }
      }
    }
  } else {
    // Failure
    commentBody = `❌ **Patch creation failed!**

There was an error creating the patch release.

**🔍 Troubleshooting:**
- Check the workflow logs for detailed error information
- Verify the commit SHA is valid and accessible
- Ensure you have permissions to create branches and PRs

**🔗 Links:**
- [View workflow run](https://github.com/${repository}/actions/runs/${runId})`;
  }

  if (!commentBody) {
    commentBody = `❌ **Patch creation failed!**

No output was generated during patch creation.

**🔗 Links:**
- [View workflow run](https://github.com/${repository}/actions/runs/${runId})`;
  }

  if (testMode) {
    console.log('\n💬 Would post comment:');
    console.log('----------------------------------------');
    console.log(commentBody);
    console.log('----------------------------------------');
    console.log('\n✅ Comment generation working correctly!');
  } else if (hasGitHubCli) {
    const { spawnSync } = await import('node:child_process');
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const { join } = await import('node:path');

    // Write comment to temporary file to avoid shell escaping issues
    const tmpFile = join(process.cwd(), `comment-${Date.now()}.md`);
    writeFileSync(tmpFile, commentBody);

    try {
      const result = spawnSync(
        'gh',
        ['pr', 'comment', originalPr.toString(), '--body-file', tmpFile],
        {
          stdio: 'inherit',
        },
      );

      if (result.error) {
        throw result.error;
      }
      if (result.status !== 0) {
        throw new Error(`gh pr comment failed with status ${result.status}`);
      }

      console.log(`Successfully commented on PR ${originalPr}`);
    } finally {
      // Clean up temp file
      try {
        unlinkSync(tmpFile);
      } catch (_e) {
        // Ignore cleanup errors
      }
    }
  } else {
    console.log('No GitHub CLI available');
  }
}

main().catch((error) => {
  console.error('Error commenting on PR:', error);
  process.exit(1);
});
