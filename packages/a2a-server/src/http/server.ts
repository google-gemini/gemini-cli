#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as url from 'node:url';
import * as path from 'node:path';

import { logger } from '../utils/logger.js';
import { main } from './app.js';

// Check if the module is the main script being run
const isMainModule =
  path.basename(process.argv[1]) ===
  path.basename(url.fileURLToPath(import.meta.url));

if (
  import.meta.url.startsWith('file:') &&
  isMainModule &&
  process.env['NODE_ENV'] !== 'test'
) {
  process.on('uncaughtException', (error) => {
    logger.error('Unhandled exception:', error);
    process.exit(1);
  });

  main().catch((error) => {
    logger.error('[CoreAgent] Unhandled error in main:', error);
    process.exit(1);
  });
}
