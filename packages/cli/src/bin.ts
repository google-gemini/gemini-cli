/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import { parseArguments, loadCliConfig } from './config/config.js';
import { debugLogger, ExitCodes } from '@google/gemini-cli-core';

async function main() {
  const argv = await parseArguments(process.argv.slice(2));
  
  // Decide between interactive and non-interactive early
  const isNonInteractive = !!(argv.prompt || argv.p || !process.stdin.isTTY || argv.outputFormat);

  if (isNonInteractive) {
    // Lazy load non-interactive logic
    const { runNonInteractiveEntryPoint } = await import('./nonInteractiveEntryPoint.js');
    await runNonInteractiveEntryPoint(argv);
  } else {
    // Lazy load interactive logic (React/Ink)
    const { runInteractiveEntryPoint } = await import('./interactiveEntryPoint.js');
    await runInteractiveEntryPoint(argv);
  }
}

main().catch((err) => {
  debugLogger.error('Fatal error in CLI:', err);
  process.exit(ExitCodes.FATAL_INTERNAL_ERROR || 1);
});
