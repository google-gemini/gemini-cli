/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

// Assuming script is run from a package directory (e.g., packages/cli)
const packageDir = process.cwd();
const rootDir = path.join(packageDir, '..', '..'); // Go up two directories to find the repo root

function getRepoVersion() {
  // Read root package.json
  const rootPackageJsonPath = path.join(rootDir, 'package.json');
  const rootPackage = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
  return rootPackage.version; // This version is now expected to be the full version string
}

const newVersion = getRepoVersion();
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
