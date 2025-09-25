#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

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

  // Sort by semver and get the highest existing version
  matchingVersions.sort((a, b) => semver.rcompare(a, b));
  const highestExistingVersion = matchingVersions[0];

  // Check if we're in a rollback scenario
  const isRollback = semver.gt(highestExistingVersion, distTagVersion);

  return {
    baseline: isRollback ? highestExistingVersion : distTagVersion,
    isRollback,
    distTagVersion,
    highestExistingVersion,
  };
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

function validateVersionConflicts(newVersion) {
  // Check if the calculated version already exists in any of the 3 sources
  const conflicts = [];

  // Check NPM - get all published versions
  try {
    const command = `npm view @google/gemini-cli versions --json`;
    const versionsJson = execSync(command).toString().trim();
    const allVersions = JSON.parse(versionsJson);
    if (allVersions.includes(newVersion)) {
      conflicts.push(`NPM registry already has version ${newVersion}`);
    }
  } catch (error) {
    console.warn(
      `Failed to check NPM versions for conflicts: ${error.message}`,
    );
  }

  // Check Git tags
  try {
    const command = `git tag -l 'v${newVersion}'`;
    const tagOutput = execSync(command).toString().trim();
    if (tagOutput === `v${newVersion}`) {
      conflicts.push(`Git tag v${newVersion} already exists`);
    }
  } catch (error) {
    console.warn(`Failed to check git tags for conflicts: ${error.message}`);
  }

  // Check GitHub releases
  try {
    const command = `gh release view "v${newVersion}" --json tagName --jq .tagName`;
    const output = execSync(command).toString().trim();
    if (output === `v${newVersion}`) {
      conflicts.push(`GitHub release v${newVersion} already exists`);
    }
  } catch (error) {
    // This is expected if the release doesn't exist - only warn on unexpected errors
    const isExpectedNotFound =
      error.message.includes('release not found') ||
      error.message.includes('Not Found') ||
      error.message.includes('not found') ||
      error.status === 1; // gh command exit code for not found
    if (!isExpectedNotFound) {
      console.warn(
        `Failed to check GitHub releases for conflicts: ${error.message}`,
      );
    }
  }

  if (conflicts.length > 0) {
    throw new Error(
      `Version conflict! Cannot create ${newVersion}:\n${conflicts.join('\n')}`,
    );
  }
}

function getAndVerifyTags(npmDistTag, gitTagPattern) {
  // Detect rollback scenarios and get the correct baseline
  const rollbackInfo = detectRollbackAndGetBaseline(npmDistTag);
  const baselineVersion = rollbackInfo.baseline;

  if (!baselineVersion) {
    throw new Error(`Unable to determine baseline version for ${npmDistTag}`);
  }

  const latestTag = getLatestTag(gitTagPattern);

  // In rollback scenarios, we don't require git tags to match the dist-tag
  // Instead, we verify the baseline version exists as a git tag
  if (!rollbackInfo.isRollback) {
    // Normal scenario: NPM dist-tag should match latest git tag
    if (`v${baselineVersion}` !== latestTag) {
      throw new Error(
        `Discrepancy found! NPM ${npmDistTag} tag (${baselineVersion}) does not match latest git ${npmDistTag} tag (${latestTag}).`,
      );
    }
  } else {
    // Rollback scenario: warn about the rollback but don't fail
    console.warn(
      `Rollback detected! NPM ${npmDistTag} tag is ${rollbackInfo.distTagVersion}, but using ${baselineVersion} as baseline for next version calculation (highest existing version).`,
    );

    // Verify the baseline version has corresponding git tag
    try {
      const baselineTagExists = execSync(`git tag -l 'v${baselineVersion}'`)
        .toString()
        .trim();
      if (baselineTagExists !== `v${baselineVersion}`) {
        throw new Error(
          `Rollback scenario detected, but git tag v${baselineVersion} does not exist! This is required to calculate the next version.`,
        );
      }
    } catch (error) {
      // If the git command itself failed, log the original error
      console.error(
        `Failed to check for git tag v${baselineVersion}: ${error.message}`,
      );
      throw new Error(
        `Rollback scenario detected, but git tag v${baselineVersion} does not exist! This is required to calculate the next version.`,
      );
    }
  }

  // Always verify GitHub release exists for the baseline version (not necessarily the dist-tag)
  verifyGitHubReleaseExists(`v${baselineVersion}`);

  return {
    latestVersion: baselineVersion,
    latestTag: `v${baselineVersion}`,
    rollbackInfo,
  };
}

function getNightlyVersion() {
  const { latestVersion, latestTag, rollbackInfo } = getAndVerifyTags(
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
    rollbackInfo,
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

  const { latestTag: previousStableTag, rollbackInfo } = getAndVerifyTags(
    'latest',
    'v[0-9].[0-9].[0-9]',
  );

  return {
    releaseVersion,
    npmTag: 'latest',
    previousReleaseTag: previousStableTag,
    rollbackInfo,
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

  const { latestTag: previousPreviewTag, rollbackInfo } = getAndVerifyTags(
    'preview',
    'v*-preview*',
  );

  return {
    releaseVersion,
    npmTag: 'preview',
    previousReleaseTag: previousPreviewTag,
    rollbackInfo,
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
  const { latestVersion, latestTag, rollbackInfo } = getAndVerifyTags(
    distTag,
    pattern,
  );

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
      rollbackInfo,
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
      rollbackInfo,
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

  // Validate that the calculated version doesn't conflict with existing versions
  validateVersionConflicts(versionData.releaseVersion);

  // Include rollback information in the output if available
  const result = {
    releaseTag: `v${versionData.releaseVersion}`,
    ...versionData,
  };

  // Add rollback information to output if it exists
  if (versionData.rollbackInfo && versionData.rollbackInfo.isRollback) {
    result.rollbackDetected = {
      rollbackScenario: true,
      distTagVersion: versionData.rollbackInfo.distTagVersion,
      highestExistingVersion: versionData.rollbackInfo.highestExistingVersion,
      baselineUsed: versionData.rollbackInfo.baseline,
      message: `Rollback detected: NPM tag was ${versionData.rollbackInfo.distTagVersion}, but using ${versionData.rollbackInfo.baseline} as baseline for next version calculation (highest existing version)`,
    };
  }

  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(getVersion(getArgs()), null, 2));
}
