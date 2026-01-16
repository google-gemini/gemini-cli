/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExitCodes, writeToStderr } from '@google/gemini-cli-core';
import type { MergedSettings } from './settings.js';
import type { CliArgs } from './config.js';

export async function runDeferredCommand(
  argv: CliArgs,
  settings: MergedSettings,
) {
  if (!argv._deferredCommand) {
    return;
  }

  const { run, type } = argv._deferredCommand;

  // Check if command is allowed based on settings
  if (type === 'mcp') {
    if (settings.admin?.mcp?.enabled === false) {
      writeToStderr('Error: MCP is disabled by your admin.\n');
      process.exit(ExitCodes.FATAL_CONFIG_ERROR);
    }
  } else if (type === 'extensions') {
    if (settings.admin?.extensions?.enabled === false) {
      writeToStderr('Error: Extensions are disabled by your admin.\n');
      process.exit(ExitCodes.FATAL_CONFIG_ERROR);
    }
  }

  await run();
}
