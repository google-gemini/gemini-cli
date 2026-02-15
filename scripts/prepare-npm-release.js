/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(rootDir, filePath), 'utf-8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(
    path.resolve(rootDir, filePath),
    JSON.stringify(data, null, 2),
  );
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

// Read native module versions from root package.json
const rootPkg = readJson('package.json');
const rootOptional = rootPkg.optionalDependencies || {};

const nativeModules = [
  '@lydell/node-pty',
  '@lydell/node-pty-darwin-arm64',
  '@lydell/node-pty-darwin-x64',
  '@lydell/node-pty-linux-x64',
  '@lydell/node-pty-win32-arm64',
  '@lydell/node-pty-win32-x64',
  'keytar',
  'node-pty',
];

const optionalDependencies = {};
for (const mod of nativeModules) {
  if (rootOptional[mod]) {
    optionalDependencies[mod] = rootOptional[mod];
  }
}

// Update @google/gemini-cli package.json for bundled npm release
const cliPkgPath = 'packages/cli/package.json';
const cliPkg = readJson(cliPkgPath);

cliPkg.files = ['bundle/'];
cliPkg.bin = {
  gemini: 'bundle/gemini.js',
};

delete cliPkg.dependencies;
delete cliPkg.devDependencies;
delete cliPkg.scripts;
delete cliPkg.main;
delete cliPkg.config;

cliPkg.optionalDependencies = optionalDependencies;

writeJson(cliPkgPath, cliPkg);

console.log('Updated packages/cli/package.json for bundled npm release.');
console.log(
  'optionalDependencies:',
  JSON.stringify(optionalDependencies, null, 2),
);
console.log('Successfully prepared packages for npm release.');
