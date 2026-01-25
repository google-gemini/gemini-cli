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
  
  const { config, settings, resumedSessionData } = await loadCliConfig(argv);

  // Decide between interactive and non-interactive early
  const isNonInteractive = !!(argv.prompt || argv.p || !process.stdin.isTTY || argv.outputFormat);

  if (isNonInteractive) {
    const { runNonInteractiveEntryPoint } = await import('./nonInteractiveEntryPoint.js');
    await runNonInteractiveEntryPoint(config, settings, resumedSessionData);
  } else {
    // Interactive path - import heavy UI
    const { runInteractiveEntryPoint } = await import('./interactiveEntryPoint.js');
    await runInteractiveEntryPoint(config, settings, resumedSessionData);
  }
}

main().catch((err) => {
  debugLogger.error('Fatal error in CLI:', err);
  // @ts-ignore
  process.exit(ExitCodes?.FATAL_INTERNAL_ERROR || 1);
});
