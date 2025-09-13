#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const command = `gh release list --limit 100 --json tagName | jq -r '[.[] | select(.tagName | ${pattern})] | .[0].tagName'`;
  try {
    return execSync(command).toString().trim();
  } catch {
    // Suppress error output for cleaner test failures
    return '';
  }
}

export function getVersion(options = {}) {
  const args = getArgs();
  const type = options.type || args.type || 'nightly';

  let releaseVersion;
  let npmTag;
  let previousReleaseTag;

  if (type === 'nightly') {
    const packageJson = JSON.parse(
      readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'),
    );
    const versionParts = packageJson.version.split('.');
    const major = versionParts[0];
    const minor = versionParts[1] ? parseInt(versionParts[1]) : 0;
    const nextMinor = minor + 1;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const gitShortHash = execSync('git rev-parse --short HEAD')
      .toString()
      .trim();
    releaseVersion = `${major}.${nextMinor}.0-nightly.${date}.${gitShortHash}`;
    npmTag = 'nightly';
    previousReleaseTag = getLatestTag('contains("nightly")');
  } else if (type === 'stable') {
    const latestPreviewTag = getLatestTag('contains("preview")');
    releaseVersion = latestPreviewTag
      .replace(/-preview.*/, '')
      .replace(/^v/, '');
    npmTag = 'latest';
    previousReleaseTag = getLatestTag(
      '(contains("nightly") or contains("preview")) | not',
    );
  } else if (type === 'preview') {
    const latestNightlyTag = getLatestTag('contains("nightly")');
    releaseVersion =
      latestNightlyTag.replace(/-nightly.*/, '').replace(/^v/, '') + '-preview';
    npmTag = 'preview';
    previousReleaseTag = getLatestTag('contains("preview")');
  } else if (type === 'patch') {
    const patchFrom = options.patchFrom || args.patchFrom;
    if (!patchFrom || (patchFrom !== 'stable' && patchFrom !== 'preview')) {
      throw new Error(
        'Patch type must be specified with --patch-from=stable or --patch-from=preview',
      );
    }

    if (patchFrom === 'stable') {
      previousReleaseTag = getLatestTag(
        '(contains("nightly") or contains("preview")) | not',
      );
      const versionParts = previousReleaseTag.replace(/^v/, '').split('.');
      const major = versionParts[0];
      const minor = versionParts[1];
      const patch = versionParts[2] ? parseInt(versionParts[2]) : 0;
      releaseVersion = `${major}.${minor}.${patch + 1}`;
      npmTag = 'latest';
    } else {
      // patchFrom === 'preview'
      previousReleaseTag = getLatestTag('contains("preview")');
      const [version, prerelease] = previousReleaseTag
        .replace(/^v/, '')
        .split('-');
      const versionParts = version.split('.');
      const major = versionParts[0];
      const minor = versionParts[1];
      const patch = versionParts[2] ? parseInt(versionParts[2]) : 0;
      releaseVersion = `${major}.${minor}.${patch + 1}-${prerelease}`;
      npmTag = 'preview';
    }
  }

  const releaseTag = `v${releaseVersion}`;

  return {
    releaseTag,
    releaseVersion,
    npmTag,
    previousReleaseTag,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(getVersion(), null, 2));
}
