#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Suppress DEP0040 (Punycode deprecation warning) safely, as Windows limits shebang flags.
const originalEmitWarning = process.emitWarning;
process.emitWarning = ((...args: unknown[]) => {
  const [warning, type, code] = args;
  if (type === 'DEP0040' || code === 'DEP0040' || (type === 'DeprecationWarning' && String(warning).includes('punycode'))) {
    return;
  }
  return Reflect.apply(originalEmitWarning, process, args);
}) as typeof process.emitWarning;

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
