/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import semver from 'semver';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

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

export function calculateNextVersion(version) {
  const parsedVersion = semver.parse(version);
  if (!parsedVersion) {
    throw new Error(`Invalid version string: ${version}`);
  }
  return `${parsedVersion.major}.${parsedVersion.minor + 1}.0-nightly`;
}

export function getReleaseVersion(type, version) {
  let releaseTag;
  const versionFromPackage = getVersionFromPackageJson();

  if (type === 'stable') {
    releaseTag = `v${semver.parse(version).version}`;
  } else if (type === 'preview') {
    const nextVersion = semver.inc(version, 'minor');
    releaseTag = `v${nextVersion}-preview`;
  } else if (type === 'nightly') {
    const now = new Date();
    const year = now.getUTCFullYear().toString();
    const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = now.getUTCDate().toString().padStart(2, '0');
    const date = `${year}${month}${day}`;
    const sha = getShortSha();
    releaseTag = `v${versionFromPackage}.${date}.${sha}`;
  } else {
    throw new Error(`Invalid release type: ${type}`);
  }

  if (!releaseTag) {
    throw new Error('Error: Version could not be determined.');
  }

  const releaseVersion = releaseTag.substring(1);
  let npmTag = 'latest';
  if (releaseVersion.includes('-')) {
    npmTag = releaseVersion.split('-')[1].split('.')[0];
  }

  const previousReleaseTag = getPreviousReleaseTag(type === 'nightly');

  return { releaseTag, releaseVersion, npmTag, previousReleaseTag };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const argv = yargs(hideBin(process.argv))
    .option('type', {
      describe: 'The type of release',
      choices: ['stable', 'preview', 'nightly'],
      demandOption: true,
    })
    .option('version', {
      describe: 'The base version to use for stable and preview releases',
      type: 'string',
    }).parse();

  try {
    const versions = getReleaseVersion(argv.type, argv.version);
    console.log(JSON.stringify(versions));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}