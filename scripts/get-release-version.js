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
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const TAG_LATEST = 'latest';
const TAG_NIGHTLY = 'nightly';
const TAG_PREVIEW = 'preview';

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function getArgs() {
  return yargs(hideBin(process.argv))
    .option('type', {
      description: 'The type of release to generate a version for.',
      choices: [TAG_NIGHTLY, 'promote-nightly', 'stable', TAG_PREVIEW, 'patch'],
      default: TAG_NIGHTLY,
    })
    .option('patch-from', {
      description: 'When type is "patch", specifies the source branch.',
      choices: ['stable', TAG_PREVIEW],
      string: true,
    })
    .option('stable_version_override', {
      description: 'Override the calculated stable version.',
      string: true,
    })
    .option('cli-package-name', {
      description:
        'fully qualified package name with scope (e.g @google/gemini-cli)',
      string: true,
      default: '@google/gemini-cli',
    })
    .option('preview_version_override', {
      description: 'Override the calculated preview version.',
      string: true,
    })
    .option('stable-base-version', {
      description: 'Base version to use for calculating next preview/nightly.',
      string: true,
    })
    .help(false)
    .version(false)
    .parse();
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

function getVersionFromNPM({ args, npmDistTag } = {}) {
  const command = `npm view ${args['cli-package-name']} version --tag=${npmDistTag}`;
  try {
    return execSync(command).toString().trim();
  } catch (error) {
    console.error(
      `Failed to get NPM version for dist-tag "${npmDistTag}": ${error.message}`,
    );
    return '';
  }
}

function getAllVersionsFromNPM({ args } = {}) {
  const command = `npm view ${args['cli-package-name']} versions --json`;
  try {
    const versionsJson = execSync(command).toString().trim();
    return JSON.parse(versionsJson);
  } catch (error) {
    console.error(`Failed to get all NPM versions: ${error.message}`);
    return [];
  }
}

function isVersionDeprecated({ args, version } = {}) {
  const command = `npm view ${args['cli-package-name']}@${version} deprecated`;
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

function detectRollbackAndGetBaseline({ args, npmDistTag } = {}) {
  // Get the current dist-tag version
  const distTagVersion = getVersionFromNPM({ args, npmDistTag });
  if (!distTagVersion) return { baseline: '', isRollback: false };

  // Get all published versions
  const allVersions = getAllVersionsFromNPM({ args });
  if (allVersions.length === 0)
    return { baseline: distTagVersion, isRollback: false };

  // Filter versions by type to match the dist-tag
  let matchingVersions;
  if (npmDistTag === TAG_LATEST) {
    // Stable versions: no prerelease identifiers
    matchingVersions = allVersions.filter(
      (v) => semver.valid(v) && !semver.prerelease(v),
    );
  } else if (npmDistTag === TAG_PREVIEW) {
    // Preview versions: contain -preview
    matchingVersions = allVersions.filter(
      (v) => semver.valid(v) && v.includes('-preview'),
    );
  } else if (npmDistTag === TAG_NIGHTLY) {
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
    if (!isVersionDeprecated({ version, args })) {
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

function doesVersionExist({ args, version } = {}) {
  // Check NPM
  try {
    const command = `npm view ${args['cli-package-name']}@${version} version 2>/dev/null`;
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

function getAndVerifyTags({ npmDistTag, args } = {}) {
  // Detect rollback scenarios and get the correct baseline
  const rollbackInfo = detectRollbackAndGetBaseline({ args, npmDistTag });
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

function getStableBaseVersion(args) {
  let latestStableVersion = args['stable-base-version'];
  if (!latestStableVersion) {
    const { latestVersion } = getAndVerifyTags({
      npmDistTag: TAG_LATEST,
      args,
    });
    latestStableVersion = latestVersion;
  }
  return latestStableVersion;
}

function promoteNightlyVersion({ args } = {}) {
  const latestStableVersion = getStableBaseVersion(args);

  const { latestTag: previousNightlyTag } = getAndVerifyTags({
    npmDistTag: TAG_NIGHTLY,
    args,
  });

  const major = semver.major(latestStableVersion);
  const minor = semver.minor(latestStableVersion);
  const nextMinor = minor + 2;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const gitShortHash = execSync('git rev-parse --short HEAD').toString().trim();
  return {
    releaseVersion: `${major}.${nextMinor}.0-nightly.${date}.${gitShortHash}`,
    npmTag: TAG_NIGHTLY,
    previousReleaseTag: previousNightlyTag,
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
    npmTag: TAG_NIGHTLY,
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
  const { latestVersion: latestPreviewVersion } = getAndVerifyTags({
    npmDistTag: TAG_PREVIEW,
    args,
  });
  let releaseVersion;
  if (args['stable_version_override']) {
    const overrideVersion = args['stable_version_override'].replace(/^v/, '');
    validateVersion(overrideVersion, 'X.Y.Z', 'stable_version_override');
    releaseVersion = overrideVersion;
  } else {
    releaseVersion = latestPreviewVersion.replace(/-preview.*/, '');
  }

  const { latestTag: previousStableTag } = getAndVerifyTags({
    npmDistTag: TAG_LATEST,
    args,
  });

  return {
    releaseVersion,
    npmTag: TAG_LATEST,
    previousReleaseTag: previousStableTag,
  };
}

function getPreviewVersion(args) {
  const latestStableVersion = getStableBaseVersion(args);

  let releaseVersion;
  if (args['preview_version_override']) {
    const overrideVersion = args['preview_version_override'].replace(/^v/, '');
    validateVersion(
      overrideVersion,
      'X.Y.Z-preview.N',
      'preview_version_override',
    );
    releaseVersion = overrideVersion;
  } else {
    const major = semver.major(latestStableVersion);
    const minor = semver.minor(latestStableVersion);
    const nextMinor = minor + 1;
    releaseVersion = `${major}.${nextMinor}.0-preview.0`;
  }

  const { latestTag: previousPreviewTag } = getAndVerifyTags({
    npmDistTag: TAG_PREVIEW,
    args,
  });

  return {
    releaseVersion,
    npmTag: TAG_PREVIEW,
    previousReleaseTag: previousPreviewTag,
  };
}

function getPatchVersion(args) {
  const patchFrom = args['patch-from'];
  if (!patchFrom || (patchFrom !== 'stable' && patchFrom !== TAG_PREVIEW)) {
    throw new Error(
      'Patch type must be specified with --patch-from=stable or --patch-from=preview',
    );
  }
  const distTag = patchFrom === 'stable' ? TAG_LATEST : TAG_PREVIEW;
  const { latestVersion, latestTag } = getAndVerifyTags({
    npmDistTag: distTag,
    args,
  });

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
  const type = args['type'] || TAG_NIGHTLY; // Nightly is the default.

  let versionData;
  switch (type) {
    case TAG_NIGHTLY:
      versionData = getNightlyVersion();
      // Nightly versions include a git hash, so conflicts are highly unlikely
      // and indicate a problem. We'll still validate but not auto-increment.
      if (doesVersionExist({ args, version: versionData.releaseVersion })) {
        throw new Error(
          `Version conflict! Nightly version ${versionData.releaseVersion} already exists.`,
        );
      }
      break;
    case 'promote-nightly':
      versionData = promoteNightlyVersion({ args });
      // A promoted nightly version is still a nightly, so we should check for conflicts.
      if (doesVersionExist({ args, version: versionData.releaseVersion })) {
        throw new Error(
          `Version conflict! Promoted nightly version ${versionData.releaseVersion} already exists.`,
        );
      }
      break;
    case 'stable':
      versionData = getStableVersion(args);
      break;
    case TAG_PREVIEW:
      versionData = getPreviewVersion(args);
      break;
    case 'patch':
      versionData = getPatchVersion(args);
      break;
    default:
      throw new Error(`Unknown release type: ${type}`);
  }

  // For patchable versions, check for existence and increment if needed.
  if (type === 'stable' || type === TAG_PREVIEW || type === 'patch') {
    let releaseVersion = versionData.releaseVersion;
    while (doesVersionExist({ args, version: releaseVersion })) {
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
