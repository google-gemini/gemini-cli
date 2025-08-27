/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as url from 'node:url';
import * as path from 'node:path';

import { logger } from './logger.js';
import { main } from './agent.js';

// Check if the module is the main script being run. path.resolve() creates a
// canonical, absolute path, which avoids cross-platform issues.
const isMainModule =
  path.resolve(process.argv[1]) ===
  path.resolve(url.fileURLToPath(import.meta.url));

process.on('uncaughtException', (error) => {
  logger.error('Unhandled exception:', error);
  process.exit(1);
});

if (
  import.meta.url.startsWith('file:') &&
  isMainModule &&
  process.env['NODE_ENV'] !== 'test'
) {
  main().catch((error) => {
    logger.error('[CoreAgent] Unhandled error in main:', error);
    process.exit(1);
  });
}
