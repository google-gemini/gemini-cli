/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';

export const disableCommand: CommandModule = {
  command: 'disable <name>',
  describe: 'Disable an extension',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'Name of the extension to disable',
        type: 'string',
      })
      .option('global', {
        describe: 'Disable the extension globally',
        type: 'boolean',
        default: false,
      }),
  handler: () => {
    // TODO: Implement disable logic
  },
};
