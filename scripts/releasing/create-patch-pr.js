#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('commit', {
      alias: 'c',
      description: 'The commit SHA to cherry-pick for the patch.',
      type: 'string',
      demandOption: true,
    })
    .option('pullRequestNumber', {
      alias: 'pr',
      description: "The pr number that we're cherry picking",
      type: 'number',
      demandOption: true,
    })
    .option('channel', {
      alias: 'ch',
      description: 'The release channel to patch.',
      choices: ['stable', 'preview'],
      demandOption: true,
    })
    .option('dry-run', {
      description: 'Whether to run in dry-run mode.',
      type: 'boolean',
      default: false,
    })
    .help()
    .alias('help', 'h').argv;

  const { commit, channel, dryRun, pullRequestNumber } = argv;

  console.log(`Starting patch process for commit: ${commit}`);
  console.log(`Targeting channel: ${channel}`);
  if (dryRun) {
    console.log('Running in dry-run mode.');
  }

  run('git fetch --all --tags --prune', dryRun);

  const releaseInfo = getLatestReleaseInfo(channel);
  const latestTag = releaseInfo.currentTag;
  const nextVersion = releaseInfo.nextVersion;

  const releaseBranch = `release/${latestTag}-pr-${pullRequestNumber}`;
  const hotfixBranch = `hotfix/${latestTag}/${nextVersion}/${channel}/cherry-pick-${commit.substring(0, 7)}/pr-${pullRequestNumber}`;

  // Create the release branch from the tag if it doesn't exist.
  if (!branchExists(releaseBranch)) {
    console.log(
      `Release branch ${releaseBranch} does not exist. Creating it from tag ${latestTag}...`,
    );
    try {
      run(`git checkout -b ${releaseBranch} ${latestTag}`, dryRun);
      run(`git push origin ${releaseBranch}`, dryRun);
    } catch (error) {
      // Check if this is a GitHub App workflows permission error
      if (
        error.message.match(/refusing to allow a GitHub App/i) &&
        error.message.match(/workflows?['`]? permission/i)
      ) {
        console.error(
          `❌ Failed to create release branch due to insufficient GitHub App permissions.`,
        );
        console.log(
          `\n📋 Please run these commands manually to create the branch:`,
        );
        console.log(`\n\`\`\`bash`);
        console.log(`git checkout -b ${releaseBranch} ${latestTag}`);
        console.log(`git push origin ${releaseBranch}`);
        console.log(`\`\`\``);
        console.log(
          `\nAfter running these commands, you can run the patch command again.`,
        );
        process.exit(1);
      } else {
        // Re-throw other errors
        throw error;
      }
    }
  } else {
    console.log(`Release branch ${releaseBranch} already exists.`);
  }

  // Check if hotfix branch already exists
  if (branchExists(hotfixBranch)) {
    console.log(`Hotfix branch ${hotfixBranch} already exists.`);

    // Check if there's already a PR for this branch
    try {
      const prInfo = execSync(
        `gh pr list --head ${hotfixBranch} --json number,url --jq '.[0] // empty'`,
      )
        .toString()
        .trim();
      if (prInfo && prInfo !== 'null' && prInfo !== '') {
        const pr = JSON.parse(prInfo);
        console.log(`Found existing PR #${pr.number}: ${pr.url}`);
        console.log(`Hotfix branch ${hotfixBranch} already has an open PR.`);
        return { existingBranch: hotfixBranch, existingPR: pr };
      } else {
        console.log(`Hotfix branch ${hotfixBranch} exists but has no open PR.`);
        console.log(
          `You may need to delete the branch and run this command again.`,
        );
        return { existingBranch: hotfixBranch };
      }
    } catch (err) {
      console.error(`Error checking for existing PR: ${err.message}`);
      console.log(`Hotfix branch ${hotfixBranch} already exists.`);
      return { existingBranch: hotfixBranch };
    }
  }

  // Create the hotfix branch from the release branch.
  console.log(
    `Creating hotfix branch ${hotfixBranch} from ${releaseBranch}...`,
  );
  run(`git checkout -b ${hotfixBranch} origin/${releaseBranch}`, dryRun);

  // Ensure git user is configured properly for commits
  console.log('Configuring git user for cherry-pick commits...');
  run('git config user.name "gemini-cli-robot"', dryRun);
  run('git config user.email "gemini-cli-robot@google.com"', dryRun);

  // Cherry-pick the commit.
  console.log(`Cherry-picking commit ${commit} into ${hotfixBranch}...`);
  let hasConflicts = false;
  if (!dryRun) {
    try {
      execSync(`git cherry-pick ${commit}`, { stdio: 'pipe' });
      console.log(`✅ Cherry-pick successful - no conflicts detected`);
    } catch (error) {
      // Check if this is a cherry-pick conflict
      try {
        const status = execSync('git status --porcelain', { encoding: 'utf8' });
        const conflictFiles = status
          .split('\n')
          .filter(
            (line) =>
              line.startsWith('UU ') ||
              line.startsWith('AA ') ||
              line.startsWith('DU ') ||
              line.startsWith('UD '),
          );

        if (conflictFiles.length > 0) {
          hasConflicts = true;
          console.log(
            `⚠️  Cherry-pick has conflicts in ${conflictFiles.length} file(s):`,
          );
          conflictFiles.forEach((file) =>
            console.log(`   - ${file.substring(3)}`),
          );

          // Add all files (including conflict markers) and commit
          console.log(
            `📝 Creating commit with conflict markers for manual resolution...`,
          );
          execSync('git add .');
          execSync(`git commit --no-edit`);
          console.log(`✅ Committed cherry-pick with conflict markers`);
        } else {
          // Re-throw if it's not a conflict error
          throw error;
        }
      } catch (_statusError) {
        // Re-throw original error if we can't determine the status
        throw error;
      }
    }
  } else {
    console.log(`[DRY RUN] Would cherry-pick ${commit}`);
  }

  // Push the hotfix branch.
  console.log(`Pushing hotfix branch ${hotfixBranch} to origin...`);
  run(`git push --set-upstream origin ${hotfixBranch}`, dryRun);

  // Create the pull request.
  console.log(
    `Creating pull request from ${hotfixBranch} to ${releaseBranch}...`,
  );
  let prTitle = `fix(patch): cherry-pick ${commit.substring(0, 7)} to ${releaseBranch} to patch version ${releaseInfo.currentTag} and create version ${releaseInfo.nextVersion}`;
  let prBody = `This PR automatically cherry-picks commit ${commit} to patch version ${releaseInfo.currentTag} in the ${channel} release to create version ${releaseInfo.nextVersion}.`;

  if (hasConflicts) {
    prTitle = `fix(patch): cherry-pick ${commit.substring(0, 7)} to ${releaseBranch} [CONFLICTS]`;
    prBody += `

## ⚠️ Merge Conflicts Detected

This cherry-pick resulted in merge conflicts that need manual resolution.

### 🔧 Next Steps:
1. **Review the conflicts**: Check out this branch and review the conflict markers
2. **Resolve conflicts**: Edit the affected files to resolve the conflicts
3. **Test the changes**: Ensure the patch works correctly after resolution
4. **Update this PR**: Push your conflict resolution

### 📋 Files with conflicts:
The commit has been created with conflict markers for easier manual resolution.

### 🚨 Important:
- Do not merge this PR until conflicts are resolved
- The automated patch release will trigger once this PR is merged`;
  }

  if (dryRun) {
    prBody += '\n\n**[DRY RUN]**';
  }

  const prCommand = `gh pr create --base ${releaseBranch} --head ${hotfixBranch} --title "${prTitle}" --body "${prBody}"`;
  run(prCommand, dryRun);

  if (hasConflicts) {
    console.log(
      '⚠️  Patch process completed with conflicts - manual resolution required!',
    );
  } else {
    console.log('✅ Patch process completed successfully!');
  }

  if (dryRun) {
    console.log('\n--- Dry Run Summary ---');
    console.log(`Release Branch: ${releaseBranch}`);
    console.log(`Hotfix Branch: ${hotfixBranch}`);
    console.log(`Pull Request Command: ${prCommand}`);
    console.log('---------------------');
  }

  return { newBranch: hotfixBranch, created: true, hasConflicts };
}

function run(command, dryRun = false, throwOnError = true) {
  console.log(`> ${command}`);
  if (dryRun) {
    return;
  }
  try {
    return execSync(command).toString().trim();
  } catch (err) {
    console.error(`Command failed: ${command}`);
    if (throwOnError) {
      throw err;
    }
    return null;
  }
}

function branchExists(branchName) {
  try {
    execSync(`git ls-remote --exit-code --heads origin ${branchName}`);
    return true;
  } catch (_e) {
    return false;
  }
}

function getLatestReleaseInfo(channel) {
  console.log(`Fetching latest release info for channel: ${channel}...`);
  const patchFrom = channel; // 'stable' or 'preview'
  const command = `node scripts/get-release-version.js --type=patch --patch-from=${patchFrom}`;
  try {
    const result = JSON.parse(execSync(command).toString().trim());
    console.log(`Current ${channel} tag: ${result.previousReleaseTag}`);
    console.log(`Next ${channel} version would be: ${result.releaseVersion}`);
    return {
      currentTag: result.previousReleaseTag,
      nextVersion: result.releaseVersion,
    };
  } catch (err) {
    console.error(`Failed to get release info for channel: ${channel}`);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
