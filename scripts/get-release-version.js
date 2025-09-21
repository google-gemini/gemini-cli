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

function validateVersion(version, format, name) {
  const versionRegex = {
    'X.Y.Z': /^\d+\.\d+\.\d+$/,
    'X.Y.Z-preview.N': /^\d+\.\d+\.\d+-preview\.\d+$/,
  };

  if (!versionRegex[format] || !versionRegex[format].test(version)) {
    throw new Error(
      `Invalid ${name}: ${version}. Must be in ${format} format.`,
    );
  }
}

function getStableVersion(args) {
  const { latestVersion: latestPreviewVersion } = getAndVerifyTags(
    'preview',
    'v*-preview*',
  );
  let releaseVersion;
  if (args.stable_version_override) {
    const overrideVersion = args.stable_version_override.replace(/^v/, '');
    validateVersion(overrideVersion, 'X.Y.Z', 'stable_version_override');
    releaseVersion = overrideVersion;
  } else {
    releaseVersion = latestPreviewVersion.replace(/-preview.*/, '');
  }

  const { latestTag: previousStableTag } = getAndVerifyTags(
    'latest',
    'v[0-9].[0-9].[0-9]',
  );

  return {
    releaseVersion,
    npmTag: 'latest',
    previousReleaseTag: previousStableTag,
  };
}

function getPreviewVersion(args) {
  const { latestVersion: latestNightlyVersion } = getAndVerifyTags(
    'nightly',
    'v*-nightly*',
  );
  let releaseVersion;
  if (args.preview_version_override) {
    const overrideVersion = args.preview_version_override.replace(/^v/, '');
    validateVersion(
      overrideVersion,
      'X.Y.Z-preview.N',
      'preview_version_override',
    );
    releaseVersion = overrideVersion;
  } else {
    releaseVersion =
      latestNightlyVersion.replace(/-nightly.*/, '') + '-preview.0';
  }

  const { latestTag: previousPreviewTag } = getAndVerifyTags(
    'preview',
    'v*-preview*',
  );

  return {
    releaseVersion,
    npmTag: 'preview',
    previousReleaseTag: previousPreviewTag,
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

  if (patchFrom === 'stable') {
    // For stable versions, increment the patch number: 0.5.4 -> 0.5.5
    const versionParts = latestVersion.split('.');
    const major = versionParts[0];
    const minor = versionParts[1];
    const patch = versionParts[2] ? parseInt(versionParts[2]) : 0;
    const releaseVersion = `${major}.${minor}.${patch + 1}`;
    return {
      releaseVersion,
      npmTag: distTag,
      previousReleaseTag: latestTag,
    };
  } else {
    // For preview versions, increment the preview number: 0.6.0-preview.2 -> 0.6.0-preview.3
    const [version, prereleasePart] = latestVersion.split('-');
    if (!prereleasePart || !prereleasePart.startsWith('preview.')) {
      throw new Error(
        `Invalid preview version format: ${latestVersion}. Expected format like "0.6.0-preview.2"`,
      );
    }

    const previewNumber = parseInt(prereleasePart.split('.')[1]);
    if (isNaN(previewNumber)) {
      throw new Error(`Could not parse preview number from: ${prereleasePart}`);
    }

    const releaseVersion = `${version}-preview.${previewNumber + 1}`;
    return {
      releaseVersion,
      npmTag: distTag,
      previousReleaseTag: latestTag,
    };
  }
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
      versionData = getStableVersion(args);
      break;
    case 'preview':
      versionData = getPreviewVersion(args);
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
