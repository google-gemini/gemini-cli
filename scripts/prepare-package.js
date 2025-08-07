/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Prepare 'core' package
copyFiles('core', {
  'README.md': 'README.md',
  LICENSE: 'LICENSE',
  '.npmrc': '.npmrc',
});

// Prepare 'cli' package
copyFiles('cli', {
  'README.md': 'README.md',
  LICENSE: 'LICENSE',
});

console.log('Successfully prepared all packages.');
