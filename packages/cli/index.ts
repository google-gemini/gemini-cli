#!/usr/bin/env -S node --no-warnings=DEP0040

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Global Entry Point ---
const VERSION_FLAGS = new Set(['-v', '--version']);

function isVersionOnlyRequest(args: string[]): boolean {
  return args.length === 1 && VERSION_FLAGS.has(args[0] ?? '');
}

function getCliVersionFromPackageJson(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = join(__dirname, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
    version?: string;
  };
  return packageJson.version ?? 'unknown';
}

if (isVersionOnlyRequest(process.argv.slice(2))) {
  try {
    process.stdout.write(`${getCliVersionFromPackageJson()}\n`);
    process.exit(0);
  } catch (error) {
    process.stderr.write(
      `Failed to read CLI version: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}

async function run() {
  const [{ main }, coreModule, { runExitCleanup }] = await Promise.all([
    import('./src/gemini.js'),
    import('@google/gemini-cli-core'),
    import('./src/utils/cleanup.js'),
  ]);
  const { FatalError, writeToStderr } = coreModule;

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

  await main().catch(async (error) => {
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
}

void run().catch((error) => {
  process.stderr.write(
    `Failed to start Gemini CLI: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
