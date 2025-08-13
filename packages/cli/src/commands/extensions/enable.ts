/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';

export const enableCommand: CommandModule = {
  command: 'enable <name>',
  describe: 'Enable an extension',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'Name of the extension to enable',
        type: 'string',
      })
      .option('global', {
        describe: 'Enable the extension globally',
        type: 'boolean',
        default: false,
      }),
  handler: () => {
    // TODO: Implement enable logic
  },
};
