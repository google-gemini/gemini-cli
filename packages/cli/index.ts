#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './src/gemini.js';
import { main } from './src/gemini.js';
import { EXIT_CODE_AUTH_CLEARED, UserClearedAuthMethodError } from '@google/gemini-cli-core';

// --- Global Entry Point ---
main().catch((error) => {
  if (error instanceof UserClearedAuthMethodError) {
    // Special exit code for start.js to restart CLI for new authentication
    process.exit(EXIT_CODE_AUTH_CLEARED);
  }
  console.error('An unexpected critical error occurred:');
  if (error instanceof Error) {
    console.error(error.stack);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
