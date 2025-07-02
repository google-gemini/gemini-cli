#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * This script aligns the versions of internal packages (`@google/*`) in the
 * `dependencies` of a package's `package.json` file.
 *
 * It reads the `package.json` from the directory where the script is run,
 * finds all other local packages within the `packages/` directory, and
 * updates the version for any dependencies that are also local packages
 * to match the version specified in that package's own `package.json`.
 */
function bindPackageDependencies() {
  const packageDir = process.cwd();
  const currentPkgJsonPath = path.join(packageDir, 'package.json');

  if (!fs.existsSync(currentPkgJsonPath)) {
    console.error(
      `Error: package.json not found in the current directory: ${packageDir}`,
    );
    process.exit(1);
  }

  const currentPkg = JSON.parse(fs.readFileSync(currentPkgJsonPath, 'utf8'));
  console.log(`Checking dependencies for: ${currentPkg.name}`);

  // Assume this script is in `<repo_root>/scripts`, so `packages` is a sibling.
  const packagesDir = path.resolve(packageDir, '..');

  // Create a map of all local package names to their versions.
  const localPackages = fs
    .readdirSync(packagesDir)
    .map((name) => {
      const dirPath = path.join(packagesDir, name);
      const pkgJsonPath = path.join(dirPath, 'package.json');
      if (
        fs.statSync(dirPath).isDirectory() &&
        fs.existsSync(pkgJsonPath)
      ) {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        return [pkg.name, pkg.version];
      }
      return null;
    })
    .filter(Boolean)
    .reduce((acc, [name, version]) => ({ ...acc, [name]: version }), {});

  if (Object.keys(localPackages).length === 0) {
    console.warn('Warning: No other local packages found to bind against.');
    return;
  }

  let dependenciesUpdated = false;

  // Update dependencies if they are local packages.
  const updatedDependencies = { ...currentPkg.dependencies };
  for (const depName in updatedDependencies) {
    if (localPackages[depName]) {
      const currentVersion = updatedDependencies[depName];
      const newVersion = localPackages[depName];
      if (currentVersion !== newVersion) {
        console.log(
          `  - Updating dependency "${depName}" from ${currentVersion} to ${newVersion}`,
        );
        updatedDependencies[depName] = newVersion;
        dependenciesUpdated = true;
      }
    }
  }

  if (dependenciesUpdated) {
    currentPkg.dependencies = updatedDependencies;
    const updatedPkgJson = JSON.stringify(currentPkg, null, 2) + '\n';
    fs.writeFileSync(currentPkgJsonPath, updatedPkgJson);
    console.log('Successfully updated package dependencies.');
  } else {
    console.log('All package dependencies are already up-to-date.');
  }
}

bindPackageDependencies();
