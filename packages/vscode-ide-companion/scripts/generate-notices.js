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

    const licenseFile = depPackageJson.licenseFile
      ? path.join(path.dirname(depPackageJsonPath), depPackageJson.licenseFile)
      : path.join(path.dirname(depPackageJsonPath), 'LICENSE');

    try {
      licenseContent = await fs.readFile(licenseFile, 'utf-8');
    } catch (e) {
      console.warn(
        `Warning: Failed to read license file for ${depName}: ${e.message}`,
      );
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

async function main() {
  try {
    const packageJsonPath = path.join(packagePath, 'package.json');
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    const dependencies = packageJson.dependencies || {};
    const dependencyEntries = Object.entries(dependencies);

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
