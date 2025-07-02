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

// Copy README.md to packages/core
const rootReadmePath = path.resolve(__dirname, '../README.md');
const coreReadmePath = path.resolve(__dirname, '../packages/core/README.md');

try {
  fs.copyFileSync(rootReadmePath, coreReadmePath);
  console.log('Copied root README.md to packages/core/');
} catch (err) {
  console.error('Error copying README.md:', err);
  process.exit(1);
}

// Copy README.md to packages/cli
const rootLicensePath = path.resolve(__dirname, '../LICENSE');
const coreLicensePath = path.resolve(__dirname, '../packages/core/LICENSE');

try {
  fs.copyFileSync(rootLicensePath, coreLicensePath);
  console.log('Copied root LICENSE to packages/core/');
} catch (err) {
  console.error('Error copying LICENSE:', err);
  process.exit(1);
}
