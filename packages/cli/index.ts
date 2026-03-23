#!/usr/bin/env node --no-warnings=DEP0040

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gemini CLI Launcher
 */

import { main } from './src/gemini.js';
import { FatalError, writeToStderr } from '@google/gemini-cli-core';
import { runExitCleanup } from './src/utils/cleanup.js';

// --- Global Entry Point ---

// Suppress known race condition error in node-pty on Windows
process.on('uncaughtException', (error) => {
  if (
    process.platform === 'win32' &&
    error instanceof Error &&
    error.message === 'Cannot resize a pty that has already exited'
  ) {
    // Known Windows race condition, ignore
    return;
  }

  // All other uncaught errors
  writeToStderr(error instanceof Error ? error.stack + '\n' : String(error) + '\n');
  process.exit(1);
});

main().catch(async (error) => {
  // Timeout to avoid hanging cleanup
  const cleanupTimeout = setTimeout(() => {
    writeToStderr('Cleanup timed out, forcing exit...\n');
    process.exit(1);
  }, 5000);

  try {
    await runExitCleanup();
  } catch (cleanupError) {
    writeToStderr(
      `Error during final cleanup: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}\n`
    );
  } finally {
    clearTimeout(cleanupTimeout);
  }

  // FatalError handling
  if (error instanceof FatalError) {
    let errorMessage = error.message;
    if (!process.env['NO_COLOR']) {
      errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
    }
    writeToStderr(errorMessage + '\n');
    process.exit(error.exitCode);
  }

  // All other unexpected errors
  writeToStderr('An unexpected critical error occurred:\n');
  if (error instanceof Error) {
    writeToStderr(error.stack + '\n');
  } else {
    writeToStderr(String(error) + '\n');
  }
  process.exit(1);
});
