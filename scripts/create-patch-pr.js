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

  const { commit, channel, dryRun } = argv;

  console.log(`Starting patch process for commit: ${commit}`);
  console.log(`Targeting channel: ${channel}`);
  if (dryRun) {
    console.log('Running in dry-run mode.');
  }

  run('git fetch --all --tags --prune', dryRun);

  const latestTag = getLatestTag(channel);
  console.log(`Found latest tag for ${channel}: ${latestTag}`);

  const releaseBranch = `release/${latestTag}`;
  const hotfixBranch = `hotfix/${latestTag}/cherry-pick-${commit.substring(0, 7)}`;

  // Create the release branch from the tag if it doesn't exist.
  if (!branchExists(releaseBranch)) {
    console.log(
      `Release branch ${releaseBranch} does not exist. Creating it from tag ${latestTag}...`,
    );
    run(`git checkout -b ${releaseBranch} ${latestTag}`, dryRun);
    run(`git push origin ${releaseBranch}`, dryRun);
  } else {
    console.log(`Release branch ${releaseBranch} already exists.`);
  }

  // Check if hotfix branch already exists
  if (branchExists(hotfixBranch)) {
    console.log(`Hotfix branch ${hotfixBranch} already exists.`);

    // Check if the existing branch already has this commit
    const hasCommit = run(
      `git branch --contains ${commit} | grep ${hotfixBranch}`,
      dryRun,
      false,
    );
    if (hasCommit) {
      console.log(`Branch ${hotfixBranch} already contains commit ${commit}.`);
      return { existingBranch: hotfixBranch, hasCommit: true };
    } else {
      console.log(
        `Branch ${hotfixBranch} exists but doesn't contain commit ${commit}.`,
      );
      return { existingBranch: hotfixBranch, hasCommit: false };
    }
  }

  // Create the hotfix branch from the release branch.
  console.log(
    `Creating hotfix branch ${hotfixBranch} from ${releaseBranch}...`,
  );
  run(`git checkout -b ${hotfixBranch} origin/${releaseBranch}`, dryRun);

  // Cherry-pick the commit.
  console.log(`Cherry-picking commit ${commit} into ${hotfixBranch}...`);
  run(`git cherry-pick ${commit}`, dryRun);

  // Push the hotfix branch.
  console.log(`Pushing hotfix branch ${hotfixBranch} to origin...`);
  run(`git push --set-upstream origin ${hotfixBranch}`, dryRun);

  // Create the pull request.
  console.log(
    `Creating pull request from ${hotfixBranch} to ${releaseBranch}...`,
  );
  const prTitle = `fix(patch): cherry-pick ${commit.substring(0, 7)} to ${releaseBranch}`;
  let prBody = `This PR automatically cherry-picks commit ${commit} to patch the ${channel} release.`;
  if (dryRun) {
    prBody += '\n\n**[DRY RUN]**';
  }
  const prCommand = `gh pr create --base ${releaseBranch} --head ${hotfixBranch} --title "${prTitle}" --body "${prBody}"`;
  run(prCommand, dryRun);

  console.log('Patch process completed successfully!');

  if (dryRun) {
    console.log('\n--- Dry Run Summary ---');
    console.log(`Release Branch: ${releaseBranch}`);
    console.log(`Hotfix Branch: ${hotfixBranch}`);
    console.log(`Pull Request Command: ${prCommand}`);
    console.log('---------------------');
  }

  return { newBranch: hotfixBranch, created: true };
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

function getLatestTag(channel) {
  console.log(`Fetching latest tag for channel: ${channel}...`);
  const pattern =
    channel === 'stable'
      ? '(contains("nightly") or contains("preview")) | not'
      : '(contains("preview"))';
  const command = `gh release list --limit 30 --json tagName | jq -r '[.[] | select(.tagName | ${pattern})] | .[0].tagName'`;
  try {
    return execSync(command).toString().trim();
  } catch (err) {
    console.error(`Failed to get latest tag for channel: ${channel}`);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
