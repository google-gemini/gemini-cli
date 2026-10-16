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

// Check that gaxios v7+ with stream corruption bug is NOT resolved in any workspace node_modules.
// gaxios v7.x (versions < 7.1.6) has a bug where Array.toString() joins stream chunks with
// commas, corrupting error response JSON at TCP chunk boundaries.
// See: https://github.com/google-gemini/gemini-cli/pull/21884
function isCorruptedGaxios(version) {
  if (!version) return false;
  const match = version.match(/^7\.(\d+)\.(\d+)/);
  if (match) {
    const minor = parseInt(match[1], 10);
    const patch = parseInt(match[2], 10);
    if (minor < 1 || (minor === 1 && patch < 6)) {
      return true;
    }
  }
  return false;
}

const gaxiosViolations = [];
for (const [location, details] of Object.entries(packages)) {
  if (
    location.match(/(^|\/)node_modules\/gaxios$/) &&
    !location.includes('@google/genai/node_modules') &&
    isCorruptedGaxios(details.version)
  ) {
    gaxiosViolations.push(`${location} (v${details.version})`);
  }
}

if (gaxiosViolations.length > 0) {
  console.error(
    '\nError: gaxios versions with stream corruption bug (v7.x < 7.1.6) detected in workspace node_modules.',
  );
  console.error('See: https://github.com/google-gemini/gemini-cli/pull/21884');
  gaxiosViolations.forEach((v) => console.error(`- ${v}`));
  console.error(
    '\nPlease ensure gaxios resolves to a version containing the fix (>= 7.1.6).',
  );
  process.exitCode = 1;
}

// Check that workspace package.json declared dependencies match resolutions in package-lock.json.
// Prevents offline/sandboxed builds (e.g. Nix, hermetic CI) from failing with ETARGET or ENOTCACHED
// due to version mismatches between package.json and locked package trees.
function satisfies(resolved, spec) {
  if (spec.startsWith('npm:')) {
    spec = spec.slice(spec.lastIndexOf('@') + 1);
  }
  if (spec === resolved || spec === '*' || spec === 'latest') return true;
  if (spec.endsWith('.x')) {
    const prefix = spec.slice(0, -2);
    return resolved.startsWith(prefix + '.') || resolved === prefix;
  }
  if (/^\d+\.\d+\.\d+/.test(spec)) {
    return spec === resolved;
  }
  return true;
}

const packagesDir = join(root, 'packages');
const workspaceMismatches = [];

if (fs.existsSync(packagesDir)) {
  const workspaceDirs = fs
    .readdirSync(packagesDir)
    .map((dir) => join('packages', dir))
    .filter((p) => fs.existsSync(join(root, p, 'package.json')));

  for (const ws of workspaceDirs) {
    const wsPkg = readJsonFile(join(root, ws, 'package.json'));
    if (!wsPkg) continue;

    const allDeps = {
      ...(wsPkg.dependencies || {}),
      ...(wsPkg.devDependencies || {}),
    };

    for (const [dep, spec] of Object.entries(allDeps)) {
      if (spec.startsWith('file:')) continue;
      const linkPkg =
        packages[`${ws}/node_modules/${dep}`] ||
        packages[`node_modules/${dep}`];
      const resolvedPkg =
        linkPkg && linkPkg.link ? packages[linkPkg.resolved] : linkPkg;

      if (!resolvedPkg) {
        workspaceMismatches.push(
          `[${ws}] ${dep}: missing from package-lock.json (declared: ${spec})`,
        );
        continue;
      }

      const resolved = resolvedPkg.version;
      if (!satisfies(resolved, spec)) {
        workspaceMismatches.push(
          `[${ws}] ${dep}: package.json requires exact ${spec}, but package-lock.json resolves to ${resolved}`,
        );
      }
    }
  }
}

if (workspaceMismatches.length > 0) {
  console.error(
    '\nError: Workspace dependencies in package.json are out-of-sync with package-lock.json:',
  );
  workspaceMismatches.forEach((m) => console.error(`- ${m}`));
  console.error(
    '\nPlease update package.json or run `npm install --package-lock-only` to synchronize the lockfile.',
  );
  process.exitCode = 1;
}

if (!process.exitCode) {
  process.exitCode = 0;
}
