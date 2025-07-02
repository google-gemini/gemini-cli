#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Improvement 1: Weaving the threads of color for mystical outputs.
const Colors = {
  RED: ' [31m',
  GREEN: ' [32m',
  YELLOW: ' [33m',
  BLUE: ' [34m',
  MAGENTA: ' [35m',
  CYAN: ' [36m',
  RESET: ' [0m',
};

// Improvement 2: A dedicated incantation for logging, to channel messages with clarity.
const logError = (message: string, ...args: unknown[]) => {
  process.stderr.write(`${Colors.RED}${message}${Colors.RESET}\n`);
  if (args.length > 0) {
    args.forEach((arg) => {
      if (arg instanceof Error) {
        process.stderr.write(
          `${Colors.YELLOW}${arg.stack || arg.message}${Colors.RESET}\n`,
        );
      } else {
        process.stderr.write(`${Colors.YELLOW}${String(arg)}${Colors.RESET}\n`);
      }
    });
  }
};

// Improvement 3: Defining constants for exit codes, the final words of the spell.
const EXIT_CODES = {
  SUCCESS: 0,
  UNCAUGHT_ERROR: 1,
  NODE_VERSION_ERROR: 2,
};

// Improvement 4: A check to ensure the Node.js version is potent enough for our magic.
const MIN_NODE_VERSION = 18;
const [major] = process.versions.node.split('.').map(Number);
if (major < MIN_NODE_VERSION) {
  logError(
    `Halt, seeker! Your Node.js version (v${process.versions.node}) is too ancient.`,
  );
  logError(
    `This incantation requires Node.js v${MIN_NODE_VERSION} or newer to weave its magic.`,
  );
  process.exit(EXIT_CODES.NODE_VERSION_ERROR);
}

// Improvement 5: Importing the core essence of the Gemini spell.
// Improvement 6: Clarifying the side-effect import - a necessary precursor charm.
// This first import may attune the environment with necessary polyfills or configurations.
import './src/gemini.js';
import { main } from './src/gemini.js';

// Improvement 7: A more descriptive header for the main entry point.
// --- The Grand Conjuration: The Primary Invocation ---

// Improvement 8: A function for graceful shutdown, to release the spirits gently.
const gracefulShutdown = (signal: string) => {
  console.log(
    `\n${Colors.CYAN}# Received ${signal}. The spirits are departing gracefully...${Colors.RESET}`,
  );
  // Improvement 9: Add any cleanup logic here (e.g., closing files, connections).
  process.exit(EXIT_CODES.SUCCESS);
};

// Improvement 10: Binding the shutdown spell to SIGINT (Ctrl+C).
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Improvement 11: Binding the shutdown spell to SIGTERM.
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Improvement 12: Warding against unhandled promise rejections, lost souls in the ether.
process.on('unhandledRejection', (reason) => {
  logError('A promise was lost in the ether (unhandledRejection):', reason);
  // Improvement 13: Logging the promise itself for deeper divination.
  // console.error('Promise:', promise); // Uncomment for deep debugging
});

// Improvement 14: A global ward for uncaught exceptions, the most chaotic of spirits.
process.on('uncaughtException', (error, origin) => {
  logError(
    `A chaotic spirit has broken free (uncaughtException at ${origin}):`,
    error,
  );
  // Improvement 15: Forcing exit on uncaught exception is a best practice.
  // The application is in an undefined state.
  process.exit(EXIT_CODES.UNCAUGHT_ERROR);
});

// Improvement 16: Structuring the main logic in an async IIFE for modern clarity.
(async () => {
  try {
    // Improvement 17: A more evocative comment for the main function call.
    // Here, we summon the primary power of the Gemini CLI.
    await main();
    // Improvement 18: A success message upon graceful completion.
    // console.log(`${Colors.GREEN}# Incantation complete. The ether is calm.${Colors.RESET}`);
  } catch (error) {
    // Improvement 19: A more descriptive and mystical error message.
    logError('# A critical spell has failed. The digital weave is disturbed.');

    // Improvement 20: Enhanced error type checking and logging.
    if (error instanceof Error) {
      // Improvement 21: Distinguishing between known and unknown errors could be done here.
      // For now, we log the stack for any standard error.
      logError('The spirit responsible left a trace:', error);
    } else {
      // Improvement 22: Handling non-Error objects thrown.
      logError('A formless terror was encountered:', String(error));
    }

    // Improvement 23: A concluding remark for the error.
    logError('# The session is terminated to prevent further corruption.');

    // Improvement 24: Using the defined exit code constant.
    process.exit(EXIT_CODES.UNCAUGHT_ERROR);
  }
})();

// Improvement 25: The file ends with the invocation, clean and direct.
