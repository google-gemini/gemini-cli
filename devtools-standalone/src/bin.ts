#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DevTools } from './index.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

async function main() {
  const devTools = DevTools.getInstance();

  // Smart Discovery:
  // 1. User provided path
  // 2. Local project temp dirs
  // 3. System temp dir

  let targetPath = process.argv[2];

  if (!targetPath) {
    const localPath = path.join(process.cwd(), '.gemini', 'tmp', 'logs');
    if (fs.existsSync(localPath)) {
      targetPath = localPath;
    } else {
      targetPath = os.tmpdir();
    }
  }

  const absolutePath = path.resolve(targetPath);
  console.log(`🔍 Watching logs in: ${absolutePath}`);

  // Note: DevTools.setLogFile automatically scans standard roots.
  devTools.setLogFile();

  const url = await devTools.start();
  if (url) {
    console.log(`🚀 Gemini DevTools active at: ${url}`);
  } else {
    console.error('Failed to start DevTools server.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error starting DevTools:', err);
  process.exit(1);
});
