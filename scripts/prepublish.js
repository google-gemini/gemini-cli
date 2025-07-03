/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const readmePath = path.resolve(process.cwd(), 'README.md');
const licensePath = path.resolve(process.cwd(), 'LICENSE');

const errors = [];

// 1. Check for package.json and the 'repository' field
// Required for publishing through wombat-dressing-room
if (!fs.existsSync(packageJsonPath)) {
  errors.push(`Error: package.json not found in ${process.cwd()}`);
} else {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (packageJson.repository !== 'google-gemini/gemini-cli') {
    errors.push(
      `Error: The "repository" field in ${packageJsonPath} must be "google-gemini/gemini-cli".`,
    );
  }
}

// 2. Check for README.md
if (!fs.existsSync(readmePath)) {
  errors.push(`Error: README.md not found in ${process.cwd()}`);
}

// 3. Check for LICENSE
if (!fs.existsSync(licensePath)) {
  errors.push(`Error: LICENSE file not found in ${process.cwd()}`);
}

if (errors.length > 0) {
  console.error('Pre-publish checks failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('Pre-publish checks passed.');
