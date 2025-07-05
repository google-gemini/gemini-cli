/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import fs from 'fs';

export function getReleaseVersion() {
  const isNightly = process.env.IS_NIGHTLY === 'true';
  const manualVersion = process.env.MANUAL_VERSION;

  let releaseTag;

  if (isNightly) {
    console.log('Calculating next nightly version...');
    releaseTag = execSync('node scripts/tag-release.js --dry-run')
      .toString()
      .trim();
  } else if (manualVersion) {
    console.log(`Using manual version: ${manualVersion}`);
    releaseTag = manualVersion;
  } else {
    throw new Error(
      'Error: No version specified and this is not a nightly release.',
    );
  }

  if (!releaseTag) {
    throw new Error('Error: Version could not be determined.');
  }

  if (!releaseTag.startsWith('v')) {
    console.log("Version is missing 'v' prefix. Prepending it.");
    releaseTag = `v${releaseTag}`;
  }

  if (releaseTag.includes('+')) {
    throw new Error(
      'Error: Versions with build metadata (+) are not supported for releases. Please use a pre-release version (e.g., v1.2.3-alpha.4) instead.',
    );
  }

  if (!releaseTag.match(/^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$/)) {
    throw new Error(
      'Error: Version must be in the format vX.Y.Z or vX.Y.Z-prerelease',
    );
  }

  const releaseVersion = releaseTag.substring(1);
  let npmTag = 'latest';
  if (releaseVersion.includes('-')) {
    npmTag = releaseVersion.split('-')[1].split('.')[0];
  }

  return { releaseTag, releaseVersion, npmTag };
}

function writeToGitHubOutput({ releaseTag, releaseVersion, npmTag }) {
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    fs.appendFileSync(githubOutput, `RELEASE_TAG=${releaseTag}\n`);
    fs.appendFileSync(githubOutput, `RELEASE_VERSION=${releaseVersion}\n`);
    fs.appendFileSync(githubOutput, `NPM_TAG=${npmTag}\n`);
  } else {
    console.log('---');
    console.log(`Finalized RELEASE_TAG: ${releaseTag}`);
    console.log(`Finalized RELEASE_VERSION: ${releaseVersion}`);
    console.log(`Finalized NPM_TAG: ${npmTag}`);
    console.log('---');
  }
}

if (require.main === module) {
  try {
    const versions = getReleaseVersion();
    writeToGitHubOutput(versions);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}


