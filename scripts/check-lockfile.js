/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const lockfilePath = join(root, 'package-lock.json');

function readJsonFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading or parsing ${filePath}:`, error);
    return null;
  }
}

console.log('Checking lockfile...');

const lockfile = readJsonFile(lockfilePath);
if (lockfile === null) {
  process.exit(1);
}
const packages = lockfile.packages || {};
const invalidPackages = [];

for (const [location, details] of Object.entries(packages)) {
  // 1. Skip the root package itself.
  if (location === '') {
    continue;
  }

  // 2. Skip local workspace packages.
  // They are identifiable in two ways:
  // a) As a symlink within node_modules.
  // b) As the source package definition, whose path is not in node_modules.
  if (details.link === true || !location.includes('node_modules')) {
    continue;
  }

  // 3. Any remaining package should be a third-party dependency.
  // 1) Registry package with both "resolved" and "integrity" fields is valid.
  if (details.resolved && details.integrity) {
    continue;
  }
  // 2) Git and file dependencies only need a "resolved" field.
  const isGitOrFileDep =
    details.resolved?.startsWith('git') ||
    details.resolved?.startsWith('file:');
  if (isGitOrFileDep) {
    continue;
  }

  // Mark the left dependency as invalid.
  invalidPackages.push(location);
}

if (invalidPackages.length > 0) {
  console.error(
    '\nError: The following dependencies in package-lock.json are missing the "resolved" or "integrity" field:',
  );
  invalidPackages.forEach((pkg) => console.error(`- ${pkg}`));
  process.exitCode = 1;
} else {
  console.log('Lockfile check passed.');
}

// Check that gaxios v7+ is NOT resolved in any workspace node_modules.
// gaxios v7.x has a bug where Array.toString() joins stream chunks with
// commas, corrupting error response JSON at TCP chunk boundaries.
// See: https://github.com/google-gemini/gemini-cli/pull/21884
const gaxiosViolations = [];
for (const [location, details] of Object.entries(packages)) {
  if (
    location.match(/(^|\/)node_modules\/gaxios$/) &&
    !location.includes('@google/genai/node_modules') &&
    details.version &&
    parseInt(details.version.split('.')[0], 10) >= 7
  ) {
    gaxiosViolations.push(`${location} (v${details.version})`);
  }
}

if (gaxiosViolations.length > 0) {
  console.error(
    '\nError: gaxios v7+ detected in workspace node_modules. This version has a stream corruption bug.',
  );
  console.error('See: https://github.com/google-gemini/gemini-cli/pull/21884');
  gaxiosViolations.forEach((v) => console.error(`- ${v}`));
  console.error(
    '\nDo NOT upgrade @google/genai or google-auth-library until the gaxios v7 bug is fixed upstream.',
  );
  process.exitCode = 1;
}

if (!process.exitCode) {
  process.exitCode = 0;
}
