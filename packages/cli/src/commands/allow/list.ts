/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadSettings } from '../../config/settings.js';
import { debugLogger } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';

async function listAllowedTools() {
  const settings = loadSettings(process.cwd());
  const allowed = settings.merged.tools?.allowed || [];

  if (allowed.length === 0) {
    debugLogger.log('No allowed tools configured.');
    return;
  }

  debugLogger.log('Allowed tools:');
  for (const tool of allowed) {
    debugLogger.log(`- ${tool}`);
  }
}

export const listCommand: CommandModule = {
  command: 'list',
  describe: 'List allowed tools',
  handler: async () => {
    await listAllowedTools();
    await exitCli();
  },
};
