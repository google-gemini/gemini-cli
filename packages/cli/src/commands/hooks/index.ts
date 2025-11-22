/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { migrateCommand } from './migrate.js';
import { listCommand } from './list.js';

export const hooksCommand: CommandModule = {
  command: 'hooks <command>',
  describe: 'Manage hooks',
  builder: (yargs) => yargs.command(migrateCommand).command(listCommand).demandCommand(),
  handler: () => {},
};
