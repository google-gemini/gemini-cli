#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const bundlePath = join(root, 'bundle', 'gemini.js');

if (!existsSync(bundlePath)) {
  console.log('Performing one-time setup. This might take a moment...');
  try {
    execSync('npm run bundle', { cwd: root, stdio: 'inherit' });
    console.log('Setup complete.');
  } catch (e) {
    console.error('Error during one-time setup:', e);
    process.exit(1);
  }
}

import(bundlePath);
