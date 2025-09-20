/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';

export const setupCommand: CommandModule = {
  command: 'setup',
  describe: 'Interactive setup for notification preferences',
  handler: async () => {
    console.log('Interactive setup for notifications is not yet implemented for the non-interactive CLI.');
    console.log('Please use the interactive CLI to set up notifications.');
  },
};
