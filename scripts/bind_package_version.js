#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * This script synchronizes the version of a package's `package.json` file
 * with the version specified in the root `package.json` of the repository.
 *
 * It's designed to be run from within a specific package's directory
 * (e.g., `packages/cli`). It traverses up to find the root `package.json`,
 * reads the version, and then applies that version to the current package's
 * `package.json`.
 */
function bindPackageVersion() {
  const packageDir = process.cwd();
  const packageJsonPath = path.join(packageDir, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    console.error(
      `Error: package.json not found in the current directory: ${packageDir}`,
    );
    process.exit(1);
  }

  // Traverse up to find the repository root (marked by a lock file or .git dir).
  let rootDir = packageDir;
  while (
    !fs.existsSync(path.join(rootDir, 'package-lock.json')) &&
    !fs.existsSync(path.join(rootDir, '.git')) &&
    path.dirname(rootDir) !== rootDir
  ) {
    rootDir = path.dirname(rootDir);
  }

  const rootPackageJsonPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(rootPackageJsonPath)) {
    console.error(
      `Error: Could not find root package.json. Looked up to ${rootDir}.`,
    );
    process.exit(1);
  }

  try {
    const rootPackage = JSON.parse(
      fs.readFileSync(rootPackageJsonPath, 'utf8'),
    );
    const newVersion = rootPackage.version;

    if (!newVersion) {
      console.error('Error: Version not found in root package.json.');
      process.exit(1);
    }

    console.log(`Found root version: ${newVersion}`);

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const currentVersion = packageJson.version;

    if (currentVersion === newVersion) {
      console.log(
        `Package "${packageJson.name}" is already at version ${newVersion}. No changes needed.`,
      );
    } else {
      console.log(
        `Updating version for "${packageJson.name}" from ${currentVersion} to ${newVersion}...`,
      );
      packageJson.version = newVersion;
      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(packageJson, null, 2) + '\n',
        'utf8',
      );
      console.log('Successfully updated version.');
    }
  } catch (err) {
    console.error(`An error occurred: ${err.message}`);
    process.exit(1);
  }
}

bindPackageVersion();
console.log('Done.')
