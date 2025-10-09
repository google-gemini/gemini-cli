#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './src/gemini.js';
import { main } from './src/gemini.js';
import { FatalError } from '@google/gemini-cli-core';

// --- Global handler for unhandled promise rejections ---
process.on('unhandledRejection', (reason) => {
  console.error('CRITICAL: Unhandled Promise Rejection!');
  if (reason instanceof Error) {
    console.error(reason.stack);
  } else {
    console.error(String(reason));
  }
  process.exit(1);
});

// --- Global Entry Point ---
main().catch((error) => {
  if (error instanceof FatalError) {
    let errorMessage = error.message;
    if (!process.env['NO_COLOR']) {
      errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
    }
    console.error(errorMessage);
    process.exit(error.exitCode);
  }
  console.error('An unexpected critical error occurred:');
  if (error instanceof Error) {
    console.error(error.stack);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
