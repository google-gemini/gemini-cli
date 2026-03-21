#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
if (argv.length === 1 && (argv[0] === '--version' || argv[0] === '-v')) {
  const require = createRequire(import.meta.url);
  const { version } = require('../package.json');
  process.stdout.write(`${version}\n`);
  process.exit(0);
}

const [geminiModule, coreModule, cleanupModule] = await Promise.all([
  import('./src/gemini.js'),
  import('@google/gemini-cli-core'),
  import('./src/utils/cleanup.js'),
]);

const { main } = geminiModule;
const { FatalError, writeToStderr } = coreModule;
const { runExitCleanup } = cleanupModule;

// --- Global Entry Point ---

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

main().catch(async (error) => {
  // Set a timeout to force exit if cleanup hangs
  const cleanupTimeout = setTimeout(() => {
    writeToStderr('Cleanup timed out, forcing exit...\n');
    process.exit(1);
  }, 5000);

  try {
    await runExitCleanup();
  } catch (cleanupError) {
    writeToStderr(
      `Error during final cleanup: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}\n`,
    );
  } finally {
    clearTimeout(cleanupTimeout);
  }

  if (error instanceof FatalError) {
    let errorMessage = error.message;
    if (!process.env['NO_COLOR']) {
      errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
    }
    writeToStderr(errorMessage + '\n');
    process.exit(error.exitCode);
  }

  writeToStderr('An unexpected critical error occurred:');
  if (error instanceof Error) {
    writeToStderr(error.stack + '\n');
  } else {
    writeToStderr(String(error) + '\n');
  }
  process.exit(1);
});
