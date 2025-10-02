/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');

function copyFiles(packageName, filesToCopy) {
  const packageDir = path.resolve(rootDir, 'packages', packageName);
  if (!fs.existsSync(packageDir)) {
    console.error(`Error: Package directory not found at ${packageDir}`);
    process.exit(1);
  }

  console.log(`Preparing package: ${packageName}`);
  for (const [source, dest] of Object.entries(filesToCopy)) {
    const sourcePath = path.resolve(rootDir, source);
    const destPath = path.resolve(packageDir, dest);
    try {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`Copied ${source} to packages/${packageName}/`);
    } catch (err) {
      console.error(`Error copying ${source}:`, err);
      process.exit(1);
    }
  }
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  if (!exists) {
    return;
  }
  const stats = fs.statSync(src);
  const isDirectory = stats.isDirectory();
  if (isDirectory) {
    fs.mkdirSync(dest, { recursive: true });
    for (const childItemName of fs.readdirSync(src)) {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
      );
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// Prepare 'core' package
copyFiles('core', {
  'README.md': 'README.md',
  LICENSE: 'LICENSE',
  '.npmrc': '.npmrc',
});

// Prepare 'cli' package
console.log('Preparing cli package...');
const cliPackageDir = path.resolve(rootDir, 'packages', 'cli');
const bundleDir = path.resolve(rootDir, 'bundle');

// 1. Run the bundle script
console.log('Running bundle script...');
try {
  execSync('npm run bundle', { stdio: 'inherit', cwd: rootDir });
} catch (error) {
  console.error('Error running bundle script:', error);
  process.exit(1);
}

// 2. Clean the cli package directory
console.log('Cleaning packages/cli/ directory...');
fs.rmSync(path.join(cliPackageDir, 'dist'), { recursive: true, force: true });

// 3. Copy bundle contents to packages/cli/
console.log('Copying bundle contents to packages/cli/...');
copyRecursiveSync(bundleDir, cliPackageDir);

// 4. Copy license and readme
console.log('Copying license and readme to cli package...');
fs.copyFileSync(
  path.join(rootDir, 'LICENSE'),
  path.join(cliPackageDir, 'LICENSE'),
);
fs.copyFileSync(
  path.join(rootDir, 'README.md'),
  path.join(cliPackageDir, 'README.md'),
);

console.log('Successfully prepared all packages.');
