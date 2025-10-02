#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import semver from 'semver';

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

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
  const command = `git tag -l '${pattern}'`;
  try {
    const tags = execSync(command)
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean);
    if (tags.length === 0) return '';

    // Convert tags to versions (remove 'v' prefix) and sort by semver
    const versions = tags
      .map((tag) => tag.replace(/^v/, ''))
      .filter((version) => semver.valid(version))
      .sort((a, b) => semver.rcompare(a, b)); // rcompare for descending order

    if (versions.length === 0) return '';

    // Return the latest version with 'v' prefix restored
    return `v${versions[0]}`;
  } catch (error) {
    console.error(
      `Failed to get latest git tag for pattern "${pattern}": ${error.message}`,
    );
    return '';
  }
}

function getVersionFromNPM(distTag) {
  const command = `npm view @google/gemini-cli version --tag=${distTag}`;
  try {
    return execSync(command).toString().trim();
  } catch (error) {
    console.error(
      `Failed to get NPM version for dist-tag "${distTag}": ${error.message}`,
    );
    return '';
  }
}

function getAllVersionsFromNPM() {
  const command = `npm view @google/gemini-cli versions --json`;
  try {
    const versionsJson = execSync(command).toString().trim();
    return JSON.parse(versionsJson);
  } catch (error) {
    console.error(`Failed to get all NPM versions: ${error.message}`);
    return [];
  }
}

function isVersionDeprecated(version) {
  const command = `npm view @google/gemini-cli@${version} deprecated`;
  try {
    const output = execSync(command).toString().trim();
    return output.length > 0;
  } catch (error) {
    // This command shouldn't fail for existing versions, but as a safeguard:
    console.error(
      `Failed to check deprecation status for ${version}: ${error.message}`,
    );
    return false; // Assume not deprecated on error to avoid breaking the release.
  }
}

function detectRollbackAndGetBaseline(npmDistTag) {
  // Get the current dist-tag version
  const distTagVersion = getVersionFromNPM(npmDistTag);
  if (!distTagVersion) return { baseline: '', isRollback: false };

  // Get all published versions
  const allVersions = getAllVersionsFromNPM();
  if (allVersions.length === 0)
    return { baseline: distTagVersion, isRollback: false };

  // Filter versions by type to match the dist-tag
  let matchingVersions;
  if (npmDistTag === 'latest') {
    // Stable versions: no prerelease identifiers
    matchingVersions = allVersions.filter(
      (v) => semver.valid(v) && !semver.prerelease(v),
    );
  } else if (npmDistTag === 'preview') {
    // Preview versions: contain -preview
    matchingVersions = allVersions.filter(
      (v) => semver.valid(v) && v.includes('-preview'),
    );
  } else if (npmDistTag === 'nightly') {
    // Nightly versions: contain -nightly
    matchingVersions = allVersions.filter(
      (v) => semver.valid(v) && v.includes('-nightly'),
    );
  } else {
    // For other dist-tags, just use the dist-tag version
    return { baseline: distTagVersion, isRollback: false };
  }

  if (matchingVersions.length === 0)
    return { baseline: distTagVersion, isRollback: false };

  // Sort by semver to get a list from highest to lowest
  matchingVersions.sort((a, b) => semver.rcompare(a, b));

  // Find the highest non-deprecated version
  let highestExistingVersion = '';
  for (const version of matchingVersions) {
    if (!isVersionDeprecated(version)) {
      highestExistingVersion = version;
      break; // Found the one we want
    } else {
      console.error(`Ignoring deprecated version: ${version}`);
    }
  }

  // If all matching versions were deprecated, fall back to the dist-tag version
  if (!highestExistingVersion) {
    highestExistingVersion = distTagVersion;
  }

  // Check if we're in a rollback scenario
  const isRollback = semver.gt(highestExistingVersion, distTagVersion);

  return {
    baseline: isRollback ? highestExistingVersion : distTagVersion,
    isRollback,
    distTagVersion,
    highestExistingVersion,
  };
}

function doesVersionExist(version) {
  // Check NPM
  try {
    const command = `npm view @google/gemini-cli@${version} version 2>/dev/null`;
    const output = execSync(command).toString().trim();
    if (output === version) {
      console.error(`Version ${version} already exists on NPM.`);
      return true;
    }
  } catch (_error) {
    // This is expected if the version doesn't exist.
  }

  // Check Git tags
  try {
    const command = `git tag -l 'v${version}'`;
    const tagOutput = execSync(command).toString().trim();
    if (tagOutput === `v${version}`) {
      console.error(`Git tag v${version} already exists.`);
      return true;
    }
  } catch (error) {
    console.error(`Failed to check git tags for conflicts: ${error.message}`);
  }

  // Check GitHub releases
  try {
    const command = `gh release view "v${version}" --json tagName --jq .tagName 2>/dev/null`;
    const output = execSync(command).toString().trim();
    if (output === `v${version}`) {
      console.error(`GitHub release v${version} already exists.`);
      return true;
    }
  } catch (error) {
    const isExpectedNotFound =
      error.message.includes('release not found') ||
      error.message.includes('Not Found') ||
      error.message.includes('not found') ||
      error.status === 1;
    if (!isExpectedNotFound) {
      console.error(
        `Failed to check GitHub releases for conflicts: ${error.message}`,
      );
    }
  }

  return false;
}

function getAndVerifyTags(npmDistTag, _gitTagPattern) {
  // Detect rollback scenarios and get the correct baseline
  const rollbackInfo = detectRollbackAndGetBaseline(npmDistTag);
  const baselineVersion = rollbackInfo.baseline;

  if (!baselineVersion) {
    throw new Error(`Unable to determine baseline version for ${npmDistTag}`);
  }

  if (rollbackInfo.isRollback) {
    // Rollback scenario: warn about the rollback but don't fail
    console.error(
      `Rollback detected! NPM ${npmDistTag} tag is ${rollbackInfo.distTagVersion}, but using ${baselineVersion} as baseline for next version calculation (highest existing version).`,
    );
  }

  // Not verifying against git tags or GitHub releases as per user request.

  return {
    latestVersion: baselineVersion,
    latestTag: `v${baselineVersion}`,
  };
}

function promoteNightlyVersion() {
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

function getNightlyVersion() {
  const packageJson = readJson('package.json');
  const baseVersion = packageJson.version.split('-')[0];
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const gitShortHash = execSync('git rev-parse --short HEAD').toString().trim();
  const releaseVersion = `${baseVersion}-nightly.${date}.${gitShortHash}`;
  const previousReleaseTag = getLatestTag('v*-nightly*');

  return {
    releaseVersion,
    npmTag: 'nightly',
    previousReleaseTag,
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
      // Nightly versions include a git hash, so conflicts are highly unlikely
      // and indicate a problem. We'll still validate but not auto-increment.
      if (doesVersionExist(versionData.releaseVersion)) {
        throw new Error(
          `Version conflict! Nightly version ${versionData.releaseVersion} already exists.`,
        );
      }
      break;
    case 'promote-nightly':
      versionData = promoteNightlyVersion();
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

  // For patchable versions, check for existence and increment if needed.
  if (type === 'stable' || type === 'preview' || type === 'patch') {
    let releaseVersion = versionData.releaseVersion;
    while (doesVersionExist(releaseVersion)) {
      console.error(`Version ${releaseVersion} exists, incrementing.`);
      if (releaseVersion.includes('-preview.')) {
        // Increment preview number: 0.6.0-preview.2 -> 0.6.0-preview.3
        const [version, prereleasePart] = releaseVersion.split('-');
        const previewNumber = parseInt(prereleasePart.split('.')[1]);
        releaseVersion = `${version}-preview.${previewNumber + 1}`;
      } else {
        // Increment patch number: 0.5.4 -> 0.5.5
        const versionParts = releaseVersion.split('.');
        const major = versionParts[0];
        const minor = versionParts[1];
        const patch = parseInt(versionParts[2]);
        releaseVersion = `${major}.${minor}.${patch + 1}`;
      }
    }
    versionData.releaseVersion = releaseVersion;
  }

  // All checks are done, construct the final result.
  const result = {
    releaseTag: `v${versionData.releaseVersion}`,
    ...versionData,
  };

  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(getVersion(getArgs()), null, 2));
}
