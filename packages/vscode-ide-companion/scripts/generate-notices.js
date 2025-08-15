/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
);
const packagePath = path.join(projectRoot, 'packages', 'vscode-ide-companion');
const noticeFilePath = path.join(packagePath, 'NOTICES.txt');

async function getDependencyLicense(depName, depVersion) {
  let depPackageJsonPath;
  let licenseContent = 'License text not found.';
  let repositoryUrl = 'No repository found';

  try {
    depPackageJsonPath = path.join(
      projectRoot,
      'node_modules',
      depName,
      'package.json',
    );
    if (!(await fs.stat(depPackageJsonPath).catch(() => false))) {
      depPackageJsonPath = path.join(
        packagePath,
        'node_modules',
        depName,
        'package.json',
      );
    }

    const depPackageJsonContent = await fs.readFile(
      depPackageJsonPath,
      'utf-8',
    );
    const depPackageJson = JSON.parse(depPackageJsonContent);

    repositoryUrl = depPackageJson.repository?.url || repositoryUrl;

    const packageDir = path.dirname(depPackageJsonPath);
    const licenseFileCandidates = [
      depPackageJson.licenseFile,
      'LICENSE',
      'LICENSE.md',
      'LICENSE.txt',
      'LICENSE-MIT.txt',
    ].filter(Boolean);

    let licenseFile;
    for (const candidate of licenseFileCandidates) {
      const potentialFile = path.join(packageDir, candidate);
      if (await fs.stat(potentialFile).catch(() => false)) {
        licenseFile = potentialFile;
        break;
      }
    }

    if (licenseFile) {
      try {
        licenseContent = await fs.readFile(licenseFile, 'utf-8');
      } catch (e) {
        console.warn(
          `Warning: Failed to read license file for ${depName}: ${e.message}`,
        );
      }
    } else {
      console.warn(`Warning: Could not find license file for ${depName}`);
    }
  } catch (e) {
    console.warn(
      `Warning: Could not find package.json for ${depName}: ${e.message}`,
    );
  }

  return {
    name: depName,
    version: depVersion,
    repository: repositoryUrl,
    license: licenseContent,
  };
}

function collectDependencies(packageName, packageLock, dependenciesMap) {
  if (dependenciesMap.has(packageName)) {
    return;
  }

  const packageInfo = packageLock.packages[`node_modules/${packageName}`];
  if (!packageInfo) {
    console.warn(
      `Warning: Could not find package info for ${packageName} in package-lock.json.`,
    );
    return;
  }

  dependenciesMap.set(packageName, packageInfo.version);

  if (packageInfo.dependencies) {
    for (const depName of Object.keys(packageInfo.dependencies)) {
      collectDependencies(depName, packageLock, dependenciesMap);
    }
  }
}

async function main() {
  try {
    const packageJsonPath = path.join(packagePath, 'package.json');
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    const packageLockJsonPath = path.join(projectRoot, 'package-lock.json');
    const packageLockJsonContent = await fs.readFile(
      packageLockJsonPath,
      'utf-8',
    );
    const packageLockJson = JSON.parse(packageLockJsonContent);

    const allDependencies = new Map();
    const directDependencies = Object.keys(packageJson.dependencies);

    for (const depName of directDependencies) {
      collectDependencies(depName, packageLockJson, allDependencies);
    }

    const dependencyEntries = Array.from(allDependencies.entries());

    const licensePromises = dependencyEntries.map(([depName, depVersion]) =>
      getDependencyLicense(depName, depVersion),
    );

    const dependencyLicenses = await Promise.all(licensePromises);

    let noticeText =
      'This file contains third-party software notices and license terms.\n\n';

    for (const dep of dependencyLicenses) {
      noticeText +=
        '============================================================\n';
      noticeText += `${dep.name}@${dep.version}\n`;
      noticeText += `(${dep.repository})\n\n`;
      noticeText += `${dep.license}\n\n`;
    }

    await fs.writeFile(noticeFilePath, noticeText);
    console.log(`NOTICES.txt generated at ${noticeFilePath}`);
  } catch (error) {
    console.error('Error generating NOTICES.txt:', error);
    process.exit(1);
  }
}

main().catch(console.error);
