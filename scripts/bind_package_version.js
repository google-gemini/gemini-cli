/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { execSync } from 'node:child_process';

// Assuming script is run from a package directory (e.g., packages/cli)
const packageDir = process.cwd();
const rootDir = path.join(packageDir, '..', '..'); // Go up two directories to find the repo root

function getBaseVersion() {
  // Read root package.json
  const rootPackageJsonPath = path.join(rootDir, 'package.json');
  const rootPackage = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
  let baseVersion = rootPackage.version;

  // Get latest commit hash
  const commitHash = execSync('git rev-parse --short HEAD', {
    encoding: 'utf8',
  }).trim();

  // Append dev suffix with commit hash
  const devSuffix = `-dev-${commitHash}.0`;
  return `${baseVersion}${devSuffix}`;
}

const argv = yargs(hideBin(process.argv))
  .option('pkg-version', {
    type: 'string',
    description: 'Set the package version',
  })
  .parse();

const newVersion = argv['pkg-version'] ?? getBaseVersion();
if (argv['pkg-version']) {
  console.log(`Using provided package version (--pkg-version): ${newVersion}`);
} else {
  console.log(
    `Using base version with dev suffix and commit hash: ${newVersion}`,
  );
}

console.log(`Setting package version to: ${newVersion}`);

const packageJsonPath = path.join(packageDir, 'package.json');

if (fs.existsSync(packageJsonPath)) {
  console.log(`Updating version for ${packageJsonPath}`);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.version = newVersion;
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2) + '\n',
    'utf8',
  );
} else {
  console.error(
    `Error: package.json not found in the current directory: ${packageJsonPath}`,
  );
  process.exit(1);
}

console.log('Done.');
