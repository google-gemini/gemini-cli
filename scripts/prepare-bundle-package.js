/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

function updatePackageJson(packagePath, updateFn) {
  const packageJsonPath = path.resolve(rootDir, packagePath);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  updateFn(packageJson);
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

// Copy bundle directory into packages/cli
const sourceBundleDir = path.resolve(rootDir, 'bundle');
const destBundleDir = path.resolve(rootDir, 'packages/cli/bundle');

if (fs.existsSync(sourceBundleDir)) {
  fs.rmSync(destBundleDir, { recursive: true, force: true });
  fs.cpSync(sourceBundleDir, destBundleDir, { recursive: true });
  console.log('Copied bundle/ directory to packages/cli/');
} else {
  console.error(
    'Error: bundle/ directory not found at project root. Please run `npm run bundle` first.',
  );
  process.exit(1);
}

// Update @google/gemini-cli to be a bundled package
updatePackageJson('packages/cli/package.json', (pkg) => {
  pkg.name = '@google-gemini/gemini-cli';
  pkg.files = ['bundle/'];
  pkg.bin = {
    gemini: 'bundle/gemini.js',
  };

  // Keep only external dependencies
  const external = [
    '@lydell/node-pty',
    'node-pty',
    '@github/keytar',
    '@google/gemini-cli-devtools',
  ];
  if (pkg.dependencies) {
    for (const dep in pkg.dependencies) {
      if (!external.includes(dep)) {
        delete pkg.dependencies[dep];
      }
    }
  }

  // Remove other fields that are not relevant to the bundled package.
  delete pkg.devDependencies;
  delete pkg.scripts;
  delete pkg.main;
  delete pkg.config; // Deletes the sandboxImageUri
});

// Update @google/gemini-cli-core name for GitHub Packages
updatePackageJson('packages/core/package.json', (pkg) => {
  pkg.name = '@google-gemini/gemini-cli-core';
});

console.log('Successfully prepared packages for GitHub release.');
