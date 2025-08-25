/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

function getLatestStableTag() {
  // Fetches all tags, then filters for the latest stable (non-prerelease) tag.
  const tags = execSync('git tag --list "v*.*.*" --sort=-v:refname')
    .toString()
    .split('\n');
  const latestStableTag = tags.find((tag) =>
    tag.match(/^v[0-9]+\.[0-9]+\.[0-9]+$/),
  );
  if (!latestStableTag) {
    throw new Error('Could not find a stable tag.');
  }
  return latestStableTag;
}

function getShortSha() {
  return execSync('git rev-parse --short HEAD').toString().trim();
}

function getNextVersionString(stableVersion, minorIncrement) {
  const [major, minor] = stableVersion.substring(1).split('.');
  const nextMinorVersion = parseInt(minor, 10) + minorIncrement;
  return `${major}.${nextMinorVersion}.0`;
}

export function getNightlyTagName(stableVersion) {
  const version = getNextVersionString(stableVersion, 2);

  const now = new Date();
  const year = now.getUTCFullYear().toString();
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  const date = `${year}${month}${day}`;

  const sha = getShortSha();
  return `v${version}-nightly.${date}.${sha}`;
}

export function getPreviewTagName(stableVersion) {
  const version = getNextVersionString(stableVersion, 1);
  return `v${version}-preview`;
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

  if (isNightly) {
    console.error('Calculating next nightly version...');
    const stableVersion = getLatestStableTag();
    releaseTag = getNightlyTagName(stableVersion);
  } else if (isPreview) {
    console.error('Calculating next preview version...');
    const stableVersion = getLatestStableTag();
    releaseTag = getPreviewTagName(stableVersion);
  } else if (manualVersion) {
    console.error(`Using manual version: ${manualVersion}`);
    releaseTag = manualVersion;
  } else {
    throw new Error(
      'Error: No version specified and this is not a nightly or preview release.',
    );
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
