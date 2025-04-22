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

function getBaseVersion() {
  // Read root package.json
  const rootPackageJsonPath = path.join(rootDir, 'package.json');
  const rootPackage = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
  let baseVersion = rootPackage.version;

  // Append nightly suffix
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const dd = String(today.getDate()).padStart(2, '0');
  const nightlySuffix = `-nightly-${yyyy}${mm}${dd}`;
  return `${baseVersion}${nightlySuffix}`;
}

const newVersion = getBaseVersion();
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
