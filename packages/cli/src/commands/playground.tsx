/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { initializeOutputListenersAndFlush } from '../gemini.js';

// We'll define the actual interactive UI runner inside an action
// but defer it like other commands to avoid heavy imports on CLI startup.

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
    // Dynamic import to keep CLI startup fast
    const { startPlayground } = await import(
      '../ui/commands/playgroundCommand.js'
    );
    await startPlayground();
  },
};
