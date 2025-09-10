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
      alias: 'h',
      description: 'The release channel to patch.',
      choices: ['stable', 'preview'],
      demandOption: true,
    })
    .help()
    .alias('help', 'h')
    .argv;

  console.log(`Starting patch process for commit: ${argv.commit}`);
  console.log(`Targeting channel: ${argv.channel}`);

  const latestTag = getLatestTag(argv.channel);
  console.log(`Found latest tag for ${argv.channel}: ${latestTag}`);

  const releaseBranch = `release/${latestTag}`;
  const hotfixBranch = `hotfix/${latestTag}/cherry-pick-${argv.commit.substring(0, 7)}`;

  // Create the release branch from the tag if it doesn't exist.
  if (!branchExists(releaseBranch)) {
    console.log(`Release branch ${releaseBranch} does not exist. Creating it from tag ${latestTag}...`);
    run(`git checkout -b ${releaseBranch} ${latestTag}`);
    run(`git push origin ${releaseBranch}`);
  } else {
    console.log(`Release branch ${releaseBranch} already exists.`);
  }

  // Create the hotfix branch from the release branch.
  console.log(`Creating hotfix branch ${hotfixBranch} from ${releaseBranch}...`);
  run(`git checkout -b ${hotfixBranch} ${releaseBranch}`);

  // Cherry-pick the commit.
  console.log(`Cherry-picking commit ${argv.commit} into ${hotfixBranch}...`);
  run(`git cherry-pick ${argv.commit}`);

  // Push the hotfix branch.
  console.log(`Pushing hotfix branch ${hotfixBranch} to origin...`);
  run(`git push --set-upstream origin ${hotfixBranch}`);

  // Create the pull request.
  console.log(`Creating pull request from ${hotfixBranch} to ${releaseBranch}...`);
  const prTitle = `fix(patch): cherry-pick ${argv.commit.substring(0, 7)} to ${releaseBranch}`;
  const prBody = `This PR automatically cherry-picks commit ${argv.commit} to patch the ${argv.channel} release.`;
  run(`gh pr create --base ${releaseBranch} --head ${hotfixBranch} --title "${prTitle}" --body "${prBody}"`);

  console.log('Patch process completed successfully!');
}

function run(command) {
  console.log(`> ${command}`);
  try {
    return execSync(command).toString().trim();
  } catch (err) {
    console.error(`Command failed: ${command}`);
    throw err;
  }
}

function branchExists(branchName) {
  try {
    execSync(`git rev-parse --verify ${branchName}`);
    return true;
  } catch (e) {
    return false;
  }
}

function getLatestTag(channel) {
  console.log(`Fetching latest tag for channel: ${channel}...`);
  const pattern =
    channel === 'stable'
      ? "'(contains(\"nightly\") or contains(\"preview\")) | not'"
      : "'(contains(\"preview\"))'";
  const command = `gh release list --limit 1 --json tagName | jq -r '[.[] | select(.tagName | ${pattern})] | .[0].tagName'`;
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
