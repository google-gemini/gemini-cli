#!/usr/bin/env -S node --no-warnings=DEP0040

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { main } from './src/gemini.js';
import { writeToStderr } from '@google/gemini-cli-core';
import { relaunchAppInChildProcess } from './src/utils/relaunch.js';

// --- Global Entry Point ---
// ... (uncaughtException handler remains the same)

// Suppress known race condition error in node-pty on Windows
// Tracking bug: https://github.com/microsoft/node-pty/issues/827
process.on('uncaughtException', (error) => {
  if (
    process.platform === 'win32' &&
    error instanceof Error &&
    error.message === 'Cannot resize a pty that has already exited'
  ) {
    // This error happens on Windows with node-pty when resizing a pty that has just exited.
    // It is a race condition in node-pty that we cannot prevent, so we silence it.
    return;
  }

  // For other errors, we rely on the default behavior, but since we attached a listener,
  // we must manually replicate it.
  if (error instanceof Error) {
    writeToStderr(error.stack + '\n');
  } else {
    writeToStderr(String(error) + '\n');
  }
  process.exit(1);
});

// Start the application.
// We use a supervised child process to enable self-healing and automatic session recovery.
relaunchAppInChildProcess([], [])
  .then(async () => {
    // relaunchAppInChildProcess either spawns a child and waits for it (supervisor mode)
    // or returns immediately if GEMINI_CLI_NO_RELAUNCH is set (supervised child mode).
    // In supervised child mode, we need to run main() here.
    if (process.env['GEMINI_CLI_NO_RELAUNCH']) {
      await main();
    }
    // In supervisor mode, the child process has already run and exited normally.
  })
  .catch((error) => {
    // If the supervisor itself fails to launch, fall back to a direct execution
    writeToStderr(
      `[Supervisor] Initial launch failed: ${error.message}. Falling back to direct mode.\n`,
    );
    main().catch((fatal) => {
      writeToStderr(`[Fatal] Direct execution failed: ${fatal.message}\n`);
      process.exit(1);
    });
  });
