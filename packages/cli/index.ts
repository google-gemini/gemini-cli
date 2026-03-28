#!/usr/bin/env -S node --no-warnings=DEP0040

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import module from 'node:module';

// Enable V8 compile cache for faster subsequent startups (Node >= 22)
// Cast to any because the project's @types/node is v20 which doesn't have this method.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (module as any).enableCompileCache === 'function') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (module as any).enableCompileCache();
  } catch {
    // Ignore if not supported or already enabled
  }
}

// --- Fast Path Intercept ---
// To achieve sub-100ms startup time for simple commands, we intercept them
// before statically importing the massive `gemini.js` chunk which takes ~400ms to parse.
const args = process.argv.slice(2);
if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
  import('node:fs').then((fs) => {
    import('node:path').then((path) => {
      import('node:url').then((url) => {
        const __filename = url.fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        let pkgPath = path.join(__dirname, '..', 'package.json');
        if (!fs.existsSync(pkgPath)) {
          // production path in bundle
          pkgPath = path.join(__dirname, 'package.json');
        }
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          console.log(pkg.version);
        }
        process.exit(0);
      });
    });
  });
} else if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
  import('./src/config/config.js').then(({ parseArguments }) => {
    import('./src/config/settings.js').then(({ loadSettings }) => {
      Promise.resolve(loadSettings()).then((settings) => {
        parseArguments(settings.merged).catch(() => process.exit(0));
      });
    });
  });
} else {
  // Load the full CLI for all other commands
  import('./src/gemini.js').then(({ main }) => {
    import('@google/gemini-cli-core').then(({ FatalError, writeToStderr }) => {
      import('./src/utils/cleanup.js').then(({ runExitCleanup }) => {
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
      });
    });
  });
}
