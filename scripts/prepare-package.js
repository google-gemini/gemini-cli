/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

function getArg(name) {
  const arg = process.argv.find((arg) => arg.startsWith(name));
  if (!arg) {
    return null;
  }
  return arg.split('=')[1];
}

function updatePackageJson(packagePath, updateFn) {
  const packageJsonPath = path.resolve(rootDir, packagePath);
  if (!fs.existsSync(packageJsonPath)) {
    console.error(`Error: package.json not found at ${packageJsonPath}`);
    process.exit(1);
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  updateFn(packageJson);
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log(`Updated ${packagePath}`);
}

const scope = getArg('--scope');
if (!scope) {
  console.error('Error: --scope argument is required.');
  process.exit(1);
}

console.log(`Preparing packages with scope: ${scope}...`);

// Update root package.json
updatePackageJson('package.json', (pkg) => {
  pkg.name = `${scope}/gemini-cli`;
});

// Update @google/gemini-cli-a2a-server
updatePackageJson('packages/a2a-server/package.json', (pkg) => {
  pkg.name = `${scope}/gemini-cli-a2a-server`;
});

// Update @google/gemini-cli-core
updatePackageJson('packages/core/package.json', (pkg) => {
  pkg.name = `${scope}/gemini-cli-core`;
});

// Update @google/gemini-cli
updatePackageJson('packages/cli/package.json', (pkg) => {
  pkg.name = `${scope}/gemini-cli`;
  pkg.dependencies['@google/gemini-cli-core'] =
    `npm:${scope}/gemini-cli-core@^0.0.0`;
});

console.log('Successfully prepared packages.');
