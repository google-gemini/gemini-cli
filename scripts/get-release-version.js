/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function getShortSha() {
  return execSync('git rev-parse --short HEAD').toString().trim();
}

function getVersionFromPackageJson() {
  const rootPackageJsonPath = resolve(process.cwd(), 'package.json');
  const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'));
  return rootPackageJson.version;
}

function getPreviousReleaseTag(isNightly) {
  if (isNightly) {
    console.error('Finding latest nightly release...');
    return execSync(
      `gh release list --limit 100 --json tagName | jq -r '[.[] | select(.tagName | contains("nightly"))] | .[0].tagName'`,
    )
      .toString()
      .trim();
  } else {
    console.error('Finding latest STABLE release (excluding pre-releases)...');
    return execSync(
      `gh release list --limit 100 --json tagName | jq -r '[.[] | select(.tagName | (contains("nightly") or contains("preview")) | not)] | .[0].tagName'`,
    )
      .toString()
      .trim();
  }
}

export function getReleaseVersion() {
  const isNightly = process.env.IS_NIGHTLY === 'true';
  const isPreview = process.env.IS_PREVIEW === 'true';
  const manualVersion = process.env.MANUAL_VERSION;

  let releaseTag;
  const versionFromPackage = getVersionFromPackageJson();

  if (isNightly) {
    console.error('Calculating next nightly version...');
    const now = new Date();
    const year = now.getUTCFullYear().toString();
    const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = now.getUTCDate().toString().padStart(2, '0');
    const date = `${year}${month}${day}`;
    const sha = getShortSha();
    releaseTag = `v${versionFromPackage}.${date}.${sha}`;
  } else if (isPreview) {
    console.error('Calculating next preview version...');
    releaseTag = `v${versionFromPackage.replace('-nightly', '-preview')}`;
  } else if (manualVersion) {
    console.error(`Using manual version: ${manualVersion}`);
    releaseTag = manualVersion;
  } else {
    // Stable release
    releaseTag = `v${versionFromPackage.replace('-nightly', '')}`;
  }

  if (!releaseTag) {
    throw new Error('Error: Version could not be determined.');
  }

  if (!releaseTag.startsWith('v')) {
    console.error("Version is missing 'v' prefix. Prepending it.");
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

  const previousReleaseTag = getPreviousReleaseTag(isNightly);

  return { releaseTag, releaseVersion, npmTag, previousReleaseTag };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const versions = getReleaseVersion();
    console.log(JSON.stringify(versions));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
