/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { initializeOutputListenersAndFlush } from '../gemini.js';

// Defer heavy UI imports to keep CLI startup fast
export const playgroundCommand: CommandModule = {
  command: 'playground',
  aliases: ['play'],
  describe: 'Launch the interactive Local Prompt Playground.',
  builder: (yargs) =>
    yargs.middleware((argv) => {
      initializeOutputListenersAndFlush();
      argv['isCommand'] = true;
    }),
  handler: async () => {
    const { startPlayground } = await import(
      '../ui/commands/playgroundCommand.js'
    );
    await startPlayground();
  },
};
