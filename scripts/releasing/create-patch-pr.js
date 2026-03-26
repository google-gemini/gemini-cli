#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

/* -------------------------------------------------------------------------- */
/*                               🧰 UTILITIES                                 */
/* -------------------------------------------------------------------------- */

const log = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  step: (msg) => console.log(`\n🔹 ${msg}`),
};

function exec(command, { dryRun = false, silent = false } = {}) {
  if (!silent) log.info(`> ${command}`);

  if (dryRun) return '';

  try {
    return execSync(command, { stdio: 'pipe' }).toString().trim();
  } catch (err) {
    log.error(`Command failed: ${command}`);
    throw new Error(err.stderr?.toString() || err.message);
  }
}

function safeParseJSON(input, context = 'JSON parse') {
  try {
    return JSON.parse(input);
  } catch {
    throw new Error(`Failed to parse ${context}`);
  }
}

/* -------------------------------------------------------------------------- */
/*                          🧠 CORE FUNCTIONALITY                             */
/* -------------------------------------------------------------------------- */

function branchExists(branch) {
  try {
    execSync(`git ls-remote --exit-code --heads origin ${branch}`);
    return true;
  } catch {
    return false;
  }
}

function getLatestReleaseInfo({ cliPackageName, channel }) {
  log.step(`Fetching release info for ${channel}`);

  const command = `node scripts/get-release-version.js --cli-package-name="${cliPackageName}" --type=patch --patch-from=${channel}`;

  const result = safeParseJSON(exec(command), 'release info');

  log.info(`Current tag: ${result.previousReleaseTag}`);
  log.info(`Next version: ${result.releaseVersion}`);

  return {
    currentTag: result.previousReleaseTag,
    nextVersion: result.releaseVersion,
  };
}

function handleCherryPick(commit, dryRun) {
  let hasConflicts = false;

  if (dryRun) {
    log.info(`[DRY RUN] Would cherry-pick ${commit}`);
    return { hasConflicts };
  }

  try {
    execSync(`git cherry-pick ${commit}`, { stdio: 'pipe' });
    log.success('Cherry-pick successful (no conflicts)');
  } catch (error) {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });

    const conflicts = status
      .split('\n')
      .filter((l) => /^(UU|AA|DU|UD)/.test(l));

    if (conflicts.length === 0) throw error;

    hasConflicts = true;

    log.warn(`Conflicts detected in ${conflicts.length} file(s):`);
    conflicts.forEach((f) => console.log(`   - ${f.substring(3)}`));

    execSync('git add .');
    execSync(`git commit --no-edit --no-verify`);

    log.success('Committed with conflict markers');
  }

  return { hasConflicts };
}

/* -------------------------------------------------------------------------- */
/*                                🚀 MAIN                                     */
/* -------------------------------------------------------------------------- */

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .options({
      commit: {
        alias: 'c',
        type: 'string',
        demandOption: true,
        describe: 'Commit SHA to cherry-pick',
      },
      pullRequestNumber: {
        alias: 'pr',
        type: 'number',
        demandOption: true,
        describe: 'PR number',
      },
      channel: {
        alias: 'ch',
        choices: ['stable', 'preview'],
        demandOption: true,
        describe: 'Release channel',
      },
      cliPackageName: {
        default: '@google/gemini-cli',
        describe: 'CLI package name',
      },
      dryRun: {
        type: 'boolean',
        default: false,
        describe: 'Dry run mode',
      },
    })
    .help().argv;

  const { commit, pullRequestNumber, channel, dryRun, cliPackageName } =
    argv;

  log.step('Starting Patch प्रक्रिया');

  exec('git fetch --all --tags --prune', { dryRun });

  const { currentTag, nextVersion } = getLatestReleaseInfo({
    cliPackageName,
    channel,
  });

  const releaseBranch = `release/${currentTag}-pr-${pullRequestNumber}`;
  const hotfixBranch = `hotfix/${currentTag}/${nextVersion}/${channel}/cherry-pick-${commit.slice(
    0,
    7,
  )}/pr-${pullRequestNumber}`;

  /* ------------------------ Release Branch Setup ------------------------ */

  if (!branchExists(releaseBranch)) {
    log.step(`Creating release branch: ${releaseBranch}`);

    try {
      exec(`git checkout -b ${releaseBranch} ${currentTag}`, { dryRun });
      exec(`git push origin ${releaseBranch}`, { dryRun });
    } catch (err) {
      log.error('GitHub permission issue detected');
      console.log(`
Run manually:
git checkout -b ${releaseBranch} ${currentTag}
git push origin ${releaseBranch}
      `);
      process.exit(1);
    }
  } else {
    log.info(`Release branch exists: ${releaseBranch}`);
  }

  /* ------------------------ Hotfix Branch Check ------------------------ */

  if (branchExists(hotfixBranch)) {
    log.warn(`Hotfix branch exists: ${hotfixBranch}`);

    try {
      const pr = exec(
        `gh pr list --head ${hotfixBranch} --json number,url --jq '.[0]'`,
      );

      if (pr) {
        const parsed = safeParseJSON(pr, 'PR info');
        log.info(`Existing PR: #${parsed.number}`);
        console.log(parsed.url);
        return;
      }
    } catch {
      log.warn('Could not check existing PR');
    }

    return;
  }

  /* ------------------------ Create Hotfix ------------------------ */

  log.step(`Creating hotfix branch`);
  exec(`git checkout -b ${hotfixBranch} origin/${releaseBranch}`, {
    dryRun,
  });

  exec(`git config user.name "gemini-cli-robot"`, { dryRun });
  exec(`git config user.email "gemini-cli-robot@google.com"`, {
    dryRun,
  });

  const { hasConflicts } = handleCherryPick(commit, dryRun);

  exec(`git push --set-upstream origin ${hotfixBranch}`, { dryRun });

  /* ------------------------ PR Creation ------------------------ */

  log.step('Creating Pull Request');

  let title = `fix(patch): cherry-pick ${commit.slice(
    0,
    7,
  )} → ${currentTag}`;
  let body = `Auto cherry-pick of ${commit} to patch ${currentTag} → ${nextVersion}`;

  if (hasConflicts) {
    title += ' [CONFLICTS]';
    body += `

⚠️ Manual conflict resolution required.
Do not merge until resolved.
`;
  }

  if (dryRun) body += '\n\n[DRY RUN]';

  exec(
    `gh pr create --base ${releaseBranch} --head ${hotfixBranch} --title "${title}" --body "${body}"`,
    { dryRun },
  );

  log.success(
    hasConflicts
      ? 'Completed with conflicts (manual action needed)'
      : 'Patch completed successfully',
  );
}

/* -------------------------------------------------------------------------- */

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
