#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function getArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      args[key] = value === undefined ? true : value;
    }
  });
  return args;
}

function getLatestTag(pattern) {
  const command = `git tag --sort=-creatordate -l '${pattern}' | head -n 1`;
  try {
    return execSync(command).toString().trim();
  } catch {
    return '';
  }
}

function getVersionFromNPM(distTag) {
  const command = `npm view @google/gemini-cli version --tag=${distTag}`;
  try {
    return execSync(command).toString().trim();
  } catch {
    return '';
  }
}

function verifyGitHubReleaseExists(tagName) {
  const command = `gh release view "${tagName}" --json tagName --jq .tagName`;
  try {
    const output = execSync(command).toString().trim();
    if (output !== tagName) {
      throw new Error(
        `Discrepancy found! NPM version ${tagName} is missing a corresponding GitHub release.`,
      );
    }
  } catch (error) {
    throw new Error(
      `Discrepancy found! Failed to verify GitHub release for ${tagName}. Error: ${error.message}`,
    );
  }
}

function getAndVerifyTags(npmDistTag, gitTagPattern) {
  const latestVersion = getVersionFromNPM(npmDistTag);
  const latestTag = getLatestTag(gitTagPattern);
  if (`v${latestVersion}` !== latestTag) {
    throw new Error(
      `Discrepancy found! NPM ${npmDistTag} tag (${latestVersion}) does not match latest git ${npmDistTag} tag (${latestTag}).`,
    );
  }
  verifyGitHubReleaseExists(latestTag);
  return { latestVersion, latestTag };
}

function getNightlyVersion() {
  const { latestVersion, latestTag } = getAndVerifyTags(
    'nightly',
    'v*-nightly*',
  );
  const baseVersion = latestVersion.split('-')[0];
  const versionParts = baseVersion.split('.');
  const major = versionParts[0];
  const minor = versionParts[1] ? parseInt(versionParts[1]) : 0;
  const nextMinor = minor + 1;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const gitShortHash = execSync('git rev-parse --short HEAD').toString().trim();
  return {
    releaseVersion: `${major}.${nextMinor}.0-nightly.${date}.${gitShortHash}`,
    npmTag: 'nightly',
    previousReleaseTag: latestTag,
  };
}

function getStableVersion() {
  const { latestVersion, latestTag } = getAndVerifyTags(
    'preview',
    'v*-preview*',
  );
  return {
    releaseVersion: latestVersion.replace(/-preview.*/, ''),
    npmTag: 'latest',
    previousReleaseTag: latestTag,
  };
}

function getPreviewVersion() {
  const { latestVersion, latestTag } = getAndVerifyTags(
    'nightly',
    'v*-nightly*',
  );
  return {
    releaseVersion: latestVersion.replace(/-nightly.*/, '') + '-preview',
    npmTag: 'preview',
    previousReleaseTag: latestTag,
  };
}

function getPatchVersion(patchFrom) {
  if (!patchFrom || (patchFrom !== 'stable' && patchFrom !== 'preview')) {
    throw new Error(
      'Patch type must be specified with --patch-from=stable or --patch-from=preview',
    );
  }
  const distTag = patchFrom === 'stable' ? 'latest' : 'preview';
  const pattern = distTag === 'latest' ? 'v[0-9].[0-9].[0-9]' : 'v*-preview*';
  const { latestVersion, latestTag } = getAndVerifyTags(distTag, pattern);
  const [version, ...prereleaseParts] = latestVersion.split('-');
  const prerelease = prereleaseParts.join('-');
  const versionParts = version.split('.');
  const major = versionParts[0];
  const minor = versionParts[1];
  const patch = versionParts[2] ? parseInt(versionParts[2]) : 0;
  const releaseVersion = prerelease
    ? `${major}.${minor}.${patch + 1}-${prerelease}`
    : `${major}.${minor}.${patch + 1}`;
  return {
    releaseVersion,
    npmTag: distTag,
    previousReleaseTag: latestTag,
  };
}

export function getVersion(options = {}) {
  const args = { ...getArgs(), ...options };
  const type = args.type || 'nightly';

  let versionData;
  switch (type) {
    case 'nightly':
      versionData = getNightlyVersion();
      break;
    case 'stable':
      versionData = getStableVersion();
      break;
    case 'preview':
      versionData = getPreviewVersion();
      break;
    case 'patch':
      versionData = getPatchVersion(args['patch-from']);
      break;
    default:
      throw new Error(`Unknown release type: ${type}`);
  }

  return {
    releaseTag: `v${versionData.releaseVersion}`,
    ...versionData,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(getVersion(getArgs()), null, 2));
}
