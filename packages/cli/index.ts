#!/usr/bin/env -S node --no-warnings=DEP0040

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Fast Path for Version ---
// We check for version flags at the very top to avoid loading any heavy dependencies.
// process.env.CLI_VERSION is defined during the build process by esbuild.
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(process.env['CLI_VERSION'] || 'unknown');
  process.exit(0);
}

// --- Global Entry Point ---

let writeToStderrFn: (message: string) => void = (msg) =>
  process.stderr.write(msg);

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
    writeToStderrFn(error.stack + '\n');
  } else {
    writeToStderrFn(String(error) + '\n');
  }
  process.exit(1);
});

const [{ main }, { FatalError, writeToStderr }, { runExitCleanup }] =
  await Promise.all([
    import('./src/gemini.js'),
    import('@google/gemini-cli-core'),
    import('./src/utils/cleanup.js'),
  ]);

writeToStderrFn = writeToStderr;

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
